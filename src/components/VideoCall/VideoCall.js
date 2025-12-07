import React, { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';
import './VideoCall.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * Компонент видеозвонка с WebRTC.
 * 
 * Протокол:
 * 1. Получаем your-id -> сохраняем clientId, отправляем set-name
 * 2. Получаем participants -> обновляем список (фильтруем себя)
 * 3. Получаем new-user -> создаём WebRTC offer
 * 4. WebRTC: offer -> answer -> candidate
 * 5. media-status приходит через participants (сервер рассылает обновлённый список)
 */
function VideoCall({
  userName,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
  onParticipantsChange,
  onLocalMediaChange,
  onLeave,
}) {
  const socket = useContext(WebSocketContext);
  
  // Refs - не вызывают re-render
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const clientIdRef = useRef(null);
  const nameSentRef = useRef(false);
  const disconnectingRef = useRef(false);
  const socketRef = useRef(socket);
  const mediaInitializedRef = useRef(false);

  // State для UI
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState({});
  const [isAudioMuted, setIsAudioMuted] = useState(!initialAudioEnabled);
  const [isVideoMuted, setIsVideoMuted] = useState(!initialVideoEnabled);

  // Синхронизируем socketRef
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  /**
   * Отправка JSON через WebSocket
   */
  const sendMessage = useCallback((data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  /**
   * Отправка leave при выходе
   */
  const sendLeave = useCallback(() => {
    if (!disconnectingRef.current) {
      disconnectingRef.current = true;
      sendMessage({ type: 'leave' });
    }
  }, [sendMessage]);

  /**
   * Создание RTCPeerConnection
   */
  const createPeerConnection = useCallback((sessionId) => {
    if (peerConnectionsRef.current[sessionId]) {
      console.log(`PeerConnection для ${sessionId} уже существует`);
      return peerConnectionsRef.current[sessionId];
    }

    console.log(`Создаём PeerConnection для ${sessionId}`);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Отправляем ICE candidate для ${sessionId}`);
        sendMessage({
          type: 'candidate',
          candidate: event.candidate,
          receiver: sessionId,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Получен трек от ${sessionId}:`, event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStreams((prev) => ({
          ...prev,
          [sessionId]: event.streams[0],
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE состояние ${sessionId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn(`ICE соединение с ${sessionId} разорвано`);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Состояние соединения ${sessionId}: ${pc.connectionState}`);
    };

    // Добавляем локальные треки если они есть
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log(`Добавляем ${tracks.length} локальных треков к PeerConnection ${sessionId}`);
      tracks.forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn(`Локальный поток ещё не готов при создании PeerConnection для ${sessionId}`);
    }

    peerConnectionsRef.current[sessionId] = pc;
    return pc;
  }, [sendMessage]);

  /**
   * Закрытие peer connection
   */
  const closePeerConnection = useCallback((sessionId) => {
    const pc = peerConnectionsRef.current[sessionId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[sessionId];
    }
    setRemoteStreams((prev) => {
      const updated = { ...prev };
      delete updated[sessionId];
      return updated;
    });
  }, []);

  /**
   * Инициация WebRTC (отправка offer)
   */
  const initiateWebRTC = useCallback(async (sessionId) => {
    try {
      // Ждём немного, чтобы медиа успело инициализироваться
      if (!localStreamRef.current) {
        console.log(`Ожидаем инициализации медиа перед созданием offer для ${sessionId}...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const pc = createPeerConnection(sessionId);
      
      // Убеждаемся, что треки добавлены
      if (localStreamRef.current && pc.getSenders().length === 0) {
        console.log(`Добавляем треки перед созданием offer для ${sessionId}`);
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendMessage({
        type: 'offer',
        offer: pc.localDescription,
        receiver: sessionId,
      });
      console.log(`Отправлен offer для ${sessionId}`);
    } catch (error) {
      console.error(`Ошибка создания offer для ${sessionId}:`, error);
    }
  }, [createPeerConnection, sendMessage]);

  /**
   * Обработка offer
   */
  const handleOffer = useCallback(async (offer, senderId) => {
    try {
      console.log(`Получен offer от ${senderId}`);
      const pc = createPeerConnection(senderId);
      
      // Убеждаемся, что треки добавлены перед ответом
      if (localStreamRef.current && pc.getSenders().length === 0) {
        console.log(`Добавляем треки перед созданием answer для ${senderId}`);
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessage({
        type: 'answer',
        answer: pc.localDescription,
        receiver: senderId,
      });
      console.log(`Отправлен answer для ${senderId}`);
    } catch (error) {
      console.error(`Ошибка обработки offer от ${senderId}:`, error);
    }
  }, [createPeerConnection, sendMessage]);

  /**
   * Обработка answer
   */
  const handleAnswer = useCallback(async (answer, senderId) => {
    try {
      console.log(`Получен answer от ${senderId}`);
      const pc = peerConnectionsRef.current[senderId];
      if (!pc) {
        console.warn(`PeerConnection для ${senderId} не найден`);
        return;
      }
      if (pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`Answer обработан для ${senderId}, состояние: ${pc.signalingState}`);
      } else {
        console.log(`Пропускаем answer для ${senderId}, соединение уже stable`);
      }
    } catch (error) {
      console.error(`Ошибка обработки answer от ${senderId}:`, error);
    }
  }, []);

  /**
   * Обработка ICE candidate
   */
  const handleCandidate = useCallback(async (candidate, senderId) => {
    try {
      const pc = peerConnectionsRef.current[senderId];
      if (!pc) {
        console.warn(`PeerConnection для ${senderId} не найден при обработке ICE candidate`);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`ICE candidate добавлен для ${senderId}`);
    } catch (error) {
      // Игнорируем ошибки ICE candidate если соединение ещё не готово
      if (error.name !== 'InvalidStateError') {
        console.error(`Ошибка ICE candidate для ${senderId}:`, error);
      }
    }
  }, []);

  /**
   * Инициализация медиа
   */
  useEffect(() => {
    if (!socket) return;

    let mounted = true;

    console.log('Запрашиваем доступ к камере и микрофону...');

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        console.log('Медиа получено:', stream.getTracks().map(t => `${t.kind}:${t.id}`));

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Применяем начальные настройки
        stream.getAudioTracks().forEach((t) => { 
          t.enabled = initialAudioEnabled;
          console.log(`Аудио трек ${t.id}: enabled = ${initialAudioEnabled}`);
        });
        stream.getVideoTracks().forEach((t) => { 
          t.enabled = initialVideoEnabled;
          console.log(`Видео трек ${t.id}: enabled = ${initialVideoEnabled}`);
        });
        setIsAudioMuted(!initialAudioEnabled);
        setIsVideoMuted(!initialVideoEnabled);
        
        // Отмечаем, что медиа инициализированы
        mediaInitializedRef.current = true;
        
        // Добавляем треки ко всем существующим PeerConnections
        Object.entries(peerConnectionsRef.current).forEach(([sessionId, pc]) => {
          const senders = pc.getSenders();
          if (senders.length === 0) {
            console.log(`Добавляем треки к существующему PeerConnection ${sessionId}`);
            stream.getTracks().forEach((track) => {
              pc.addTrack(track, stream);
            });
          }
        });
        
        // Отправляем начальный статус медиа на сервер
        if (socketRef.current?.readyState === WebSocket.OPEN && clientIdRef.current) {
          sendMessage({
            type: 'media-status',
            audioEnabled: initialAudioEnabled,
            videoEnabled: initialVideoEnabled,
          });
        }
      })
      .catch((error) => {
        console.error('Ошибка получения медиа:', error);
        alert('Не удалось получить доступ к камере/микрофону. Проверьте разрешения браузера.');
      });

    return () => {
      mounted = false;
      sendLeave();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      mediaInitializedRef.current = false;
      Object.keys(peerConnectionsRef.current).forEach(closePeerConnection);
    };
  }, [socket, initialAudioEnabled, initialVideoEnabled, sendLeave, closePeerConnection, sendMessage]);

  /**
   * Обработка WebSocket сообщений
   */
  useEffect(() => {
    if (!socket) return;

    const handleMessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      const { type, sender } = data;

      // Фильтруем WebRTC сигналы не для нас
      if (data.receiver && data.receiver !== clientIdRef.current) {
        return;
      }

      switch (type) {
        case 'your-id': {
          const myId = data.sessionId;
          console.log('Мой ID:', myId);
          clientIdRef.current = myId;

          // Отправляем set-name один раз
          if (!nameSentRef.current) {
            nameSentRef.current = true;
            sendMessage({ type: 'set-name', name: userName });
            console.log('Отправлено set-name:', userName);
          }
          break;
        }

        case 'participants': {
          const items = data.items || [];
          const myId = clientIdRef.current;

          console.log('Получен список participants:', items.length, 'мой ID:', myId);

          // Фильтруем себя и строим map
          const map = {};
          items.forEach((p) => {
            if (p.sessionId !== myId) {
              map[p.sessionId] = {
                userName: p.userName,
                audioEnabled: p.audioEnabled === true,
                videoEnabled: p.videoEnabled === true,
              };
            }
          });

          setParticipants(map);
          console.log('Участников (без себя):', Object.keys(map).length);
          break;
        }

        case 'new-user': {
          if (data.sessionId !== clientIdRef.current) {
            console.log('Новый участник, инициируем WebRTC:', data.sessionId);
            await initiateWebRTC(data.sessionId);
          }
          break;
        }

        case 'user-left': {
          const leftId = data.sessionId;
          console.log('Участник вышел:', leftId);
          closePeerConnection(leftId);
          setParticipants((prev) => {
            const updated = { ...prev };
            delete updated[leftId];
            return updated;
          });
          break;
        }

        case 'offer':
          await handleOffer(data.offer, sender);
          break;

        case 'answer':
          await handleAnswer(data.answer, sender);
          break;

        case 'candidate':
          await handleCandidate(data.candidate, sender);
          break;

        default:
          break;
      }
    };

    const handleClose = () => {
      if (!disconnectingRef.current) {
        onLeave?.();
      }
    };

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);

    return () => {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
    };
  }, [socket, userName, sendMessage, initiateWebRTC, handleOffer, handleAnswer, handleCandidate, closePeerConnection, onLeave]);

  /**
   * Уведомляем родителя о локальном медиа
   */
  useEffect(() => {
    onLocalMediaChange?.(!isAudioMuted, !isVideoMuted);
  }, [isAudioMuted, isVideoMuted, onLocalMediaChange]);

  /**
   * Переключение микрофона
   */
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('toggleAudio: Локальный поток не инициализирован');
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('toggleAudio: Нет аудио треков');
      return;
    }

    // Получаем текущее состояние из первого трека
    const currentEnabled = audioTracks[0].enabled;
    const newEnabled = !currentEnabled;

    // Переключаем состояние всех аудио треков
    audioTracks.forEach((track) => {
      track.enabled = newEnabled;
      console.log(`Аудио трек ${track.id}: enabled = ${newEnabled}`);
    });

    // Обновляем состояние UI (muted = !enabled)
    setIsAudioMuted(!newEnabled);
    console.log(`toggleAudio: isAudioMuted = ${!newEnabled}`);
  }, []);

  /**
   * Переключение камеры
   */
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('toggleVideo: Локальный поток не инициализирован');
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn('toggleVideo: Нет видео треков');
      return;
    }

    // Получаем текущее состояние из первого трека
    const currentEnabled = videoTracks[0].enabled;
    const newEnabled = !currentEnabled;

    // Переключаем состояние всех видео треков
    videoTracks.forEach((track) => {
      track.enabled = newEnabled;
      console.log(`Видео трек ${track.id}: enabled = ${newEnabled}`);
    });

    // Обновляем состояние UI (muted = !enabled)
    setIsVideoMuted(!newEnabled);
    console.log(`toggleVideo: isVideoMuted = ${!newEnabled}`);
  }, []);

  /**
   * Отправка статуса медиа на сервер при изменении (только после инициализации)
   */
  useEffect(() => {
    // Отправляем статус только если медиа уже инициализированы и есть подключение
    if (mediaInitializedRef.current && socketRef.current?.readyState === WebSocket.OPEN && clientIdRef.current) {
      sendMessage({
        type: 'media-status',
        audioEnabled: !isAudioMuted,
        videoEnabled: !isVideoMuted,
      });
    }
  }, [isAudioMuted, isVideoMuted, sendMessage]);

  /**
   * Выход из встречи
   */
  const leaveMeeting = useCallback(() => {
    sendLeave();
    Object.keys(peerConnectionsRef.current).forEach(closePeerConnection);
    setRemoteStreams({});
    setParticipants({});
    onLeave?.();
  }, [sendLeave, closePeerConnection, onLeave]);

  /**
   * beforeunload
   */
  useEffect(() => {
    const handler = () => sendLeave();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sendLeave]);

  const participantIds = Object.keys(participants);

  return (
    <div className="video-call-container">
      <div className="video-grid">
        {/* Локальное видео */}
        <div className="video-item">
          <video ref={localVideoRef} autoPlay muted playsInline />
          <div className="user-name-overlay">{userName || 'Вы'}</div>
          <div className="media-badges">
            <span className={`badge ${isAudioMuted ? 'muted' : ''}`}>
              <i className={`fas ${isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </span>
            <span className={`badge ${isVideoMuted ? 'muted' : ''}`}>
              <i className={`fas ${isVideoMuted ? 'fa-video-slash' : 'fa-video'}`} />
            </span>
          </div>
          {isVideoMuted && (
            <div className="video-muted-overlay">
              <i className="fas fa-video-slash" />
            </div>
          )}
          <div className="controls">
            <button onClick={toggleAudio} title={isAudioMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
              <i className={`fas ${isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </button>
            <button onClick={toggleVideo} title={isVideoMuted ? 'Включить камеру' : 'Выключить камеру'}>
              <i className={`fas ${isVideoMuted ? 'fa-video-slash' : 'fa-video'}`} />
            </button>
          </div>
        </div>

        {/* Удалённые участники */}
        {participantIds.map((sessionId) => (
          <ParticipantTile
            key={sessionId}
            stream={remoteStreams[sessionId]}
            participant={participants[sessionId]}
          />
        ))}
      </div>

      <div className="controls-row">
        <button className="danger" onClick={leaveMeeting}>
          <i className="fas fa-phone-slash" /> Покинуть встречу
        </button>
      </div>
    </div>
  );
}

/**
 * Плитка участника
 */
function ParticipantTile({ stream, participant }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const userName = participant?.userName || 'Участник';
  const audioEnabled = participant?.audioEnabled === true;
  const videoEnabled = participant?.videoEnabled === true;

  return (
    <div className="video-item">
      {stream ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className="video-placeholder">
          {userName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="user-name-overlay">{userName}</div>
      <div className="media-badges">
        <span className={`badge ${!audioEnabled ? 'muted' : ''}`}>
          <i className={`fas ${!audioEnabled ? 'fa-microphone-slash' : 'fa-microphone'}`} />
        </span>
        <span className={`badge ${!videoEnabled ? 'muted' : ''}`}>
          <i className={`fas ${!videoEnabled ? 'fa-video-slash' : 'fa-video'}`} />
        </span>
      </div>
      {!videoEnabled && (
        <div className="video-muted-overlay">
          <i className="fas fa-video-slash" />
        </div>
      )}
    </div>
  );
}

export default VideoCall;
