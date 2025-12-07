import React, { useRef, useState, useEffect, useContext } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';
import './VideoCall.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function VideoCall({ userName, initialAudioEnabled = true, initialVideoEnabled = true, onParticipantsChange, onLocalMediaChange }) {
  const socket = useContext(WebSocketContext);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});

  const [clientId, setClientId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteUserNames, setRemoteUserNames] = useState({});
  const [remoteMediaStatus, setRemoteMediaStatus] = useState({});
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Функция для рассылки своего статуса устройств
  const broadcastMediaStatus = (status) => {
    if (socket?.readyState === WebSocket.OPEN && clientId) {
      socket.send(JSON.stringify({ type: 'media-status', ...status }));
    }
  };

  // Инициируем получение локального медиа и присоединение к звонку
  useEffect(() => {
    if (!socket) return;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        // Применяем начальные настройки выключения микрофона/камеры, если задано
        if (!initialAudioEnabled) {
          stream.getAudioTracks().forEach(track => track.enabled = false);
          setIsAudioMuted(true);
        }
        if (!initialVideoEnabled) {
          stream.getVideoTracks().forEach(track => track.enabled = false);
          setIsVideoMuted(true);
        }
        // После получения медиа – отправляем сигнал о присоединении
        const joinMessage = () => {
          socket.send(JSON.stringify({ type: 'join' }));
        };
        if (socket.readyState === WebSocket.OPEN) {
          joinMessage();
        } else {
          socket.addEventListener('open', joinMessage, { once: true });
        }
      })
      .catch((error) => {
        console.error('Ошибка получения медиа:', error);
        alert('Не удалось получить доступ к камере/микрофону. Проверьте настройки устройств.');
      });

    // Очистка при размонтировании: остановка локальных треков и закрытие peerConnections
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setRemoteUserNames({});
      setRemoteMediaStatus({});
    };
  }, [socket, initialAudioEnabled, initialVideoEnabled]);

  // Обработчик входящих сообщений WebSocket
  useEffect(() => {
    if (!socket) return;
    const handleSocketMessage = async (event) => {
      const data = JSON.parse(event.data);
      const { type, sender, sessionId } = data;
      switch (type) {
        case 'your-id': {
          // Получили свой ID, сохраняем его и отправляем имя и статус устройств
          const myId = data.sessionId;
          setClientId(myId);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'set-name', name: userName, sessionId: myId }));
            // Отправляем начальные статусы аудио/видео
            broadcastMediaStatus({
              audioEnabled: !isAudioMuted,
              videoEnabled: !isVideoMuted,
            });
          }
          break;
        }
        case 'participants': {
          // Получили список существующих участников при подключении
          const items = data.items || [];
          // Обновляем словари имен и статусов участников
          const initialNames = {};
          const initialStatuses = {};
          items.forEach((participant) => {
            initialNames[participant.sessionId] = participant.userName;
            initialStatuses[participant.sessionId] = {
              audioEnabled: participant.audioEnabled !== false, 
              videoEnabled: participant.videoEnabled !== false
            };
          });
          setRemoteUserNames(initialNames);
          setRemoteMediaStatus(initialStatuses);
          break;
        }
        case 'new-user': {
          // Новый участник вошел: сохраняем его имя, по умолчанию считаем устройства включёнными
          setRemoteUserNames((prev) => ({
            ...prev,
            [data.sessionId]: data.userName
          }));
          setRemoteMediaStatus((prev) => ({
            ...prev,
            [data.sessionId]: {
              audioEnabled: true,
              videoEnabled: true
            }
          }));
          // Инициируем WebRTC-подключение к новому участнику
          await handleNewUser(data.sessionId);
          break;
        }
        case 'user-left': {
          // Участник вышел: закрываем его PeerConnection и удаляем данные
          handleUserLeft(sessionId);
          break;
        }
        case 'media-status': {
          // Обновление статуса камеры/микрофона от участника sender
          handleMediaStatus(sender, data.audioEnabled, data.videoEnabled);
          break;
        }
        case 'set-name': {
          // Обновление имени участника (если кто-то сменил имя)
          setRemoteUserNames((prev) => ({ ...prev, [sessionId]: data.name }));
          break;
        }
        case 'offer': {
          await handleOffer(data.offer, sender);
          break;
        }
        case 'answer': {
          await handleAnswer(data.answer, sender);
          break;
        }
        case 'candidate': {
          await handleCandidate(data.candidate, sender);
          break;
        }
        default:
          break;
      }
    };
    socket.addEventListener('message', handleSocketMessage);
    return () => socket.removeEventListener('message', handleSocketMessage);
  }, [socket, userName, isAudioMuted, isVideoMuted]);

  // Отслеживаем изменения списков имен или статусов удалённых участников, объединяем для обновления списка
  useEffect(() => {
    const participantsList = Object.entries(remoteUserNames).map(([id, name]) => ({
      id,
      name: name || 'Участник',
      audioEnabled: remoteMediaStatus[id]?.audioEnabled !== false,
      videoEnabled: remoteMediaStatus[id]?.videoEnabled !== false
    }));
    onParticipantsChange?.(participantsList);
  }, [remoteUserNames, remoteMediaStatus, onParticipantsChange]);

  // Отслеживаем изменения локального статуса устройств и уведомляем родительский компонент
  useEffect(() => {
    onLocalMediaChange?.(!isAudioMuted, !isVideoMuted);
    // Каждое изменение локального статуса также транслируем другим участникам
    if (clientId && socket?.readyState === WebSocket.OPEN) {
      broadcastMediaStatus({
        audioEnabled: !isAudioMuted,
        videoEnabled: !isVideoMuted
      });
    }
  }, [isAudioMuted, isVideoMuted, clientId]);

  // Функция создания PeerConnection для нового участника
  const createPeerConnection = (sessionId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = (event) => {
      if (event.candidate && clientId && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          sender: clientId,
          receiver: sessionId,
        }));
      }
    };
    pc.ontrack = (event) => {
      setRemoteStreams((prevStreams) => ({
        ...prevStreams,
        [sessionId]: event.streams[0],
      }));
    };
    // Добавляем свои медиатреки в новый PeerConnection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }
    return pc;
  };

  // Обработка прихода нового участника (мы — существующий участник, отправляем ему offer)
  const handleNewUser = async (newSessionId) => {
    // Создаем запись о новом участнике (PeerConnection + предлагаем соединение)
    const pc = createPeerConnection(newSessionId);
    peerConnections.current[newSessionId] = pc;
    // Генерируем оффер и отправляем его новому участнику
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (clientId && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'offer',
        offer: pc.localDescription,
        sender: clientId,
        receiver: newSessionId,
      }));
    }
  };

  // Обработка полученного оффера (мы — новый участник, получаем offer и отвечаем answer)
  const handleOffer = async (offer, senderId) => {
    const pc = createPeerConnection(senderId);
    peerConnections.current[senderId] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (clientId && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'answer',
        answer: pc.localDescription,
        sender: clientId,
        receiver: senderId,
      }));
    }
  };

  // Обработка полученного ответа на наш оффер
  const handleAnswer = async (answer, senderId) => {
    const pc = peerConnections.current[senderId];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  // Обработка полученного кандидата ICE
  const handleCandidate = async (candidate, senderId) => {
    const pc = peerConnections.current[senderId];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  // Обработка отключения участника
  const handleUserLeft = (sessionId) => {
    const pc = peerConnections.current[sessionId];
    if (pc) {
      pc.close();
      delete peerConnections.current[sessionId];
    }
    setRemoteStreams((prevStreams) => {
      const updated = { ...prevStreams };
      delete updated[sessionId];
      return updated;
    });
    setRemoteMediaStatus((prevStatus) => {
      const updated = { ...prevStatus };
      delete updated[sessionId];
      return updated;
    });
    setRemoteUserNames((prevNames) => {
      const updated = { ...prevNames };
      delete updated[sessionId];
      return updated;
    });
  };

  // Обработка обновления статусов медиа удалённого участника
  const handleMediaStatus = (senderId, audioEnabled, videoEnabled) => {
    setRemoteMediaStatus((prevStatus) => ({
      ...prevStatus,
      [senderId]: {
        audioEnabled: audioEnabled !== undefined ? audioEnabled : prevStatus[senderId]?.audioEnabled ?? true,
        videoEnabled: videoEnabled !== undefined ? videoEnabled : prevStatus[senderId]?.videoEnabled ?? true,
      },
    }));
  };

  // Обработчики выключения/включения собственного микрофона и камеры
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const next = !isAudioMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isAudioMuted;
      });
      setIsAudioMuted(next);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const next = !isVideoMuted;
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoMuted;
      });
      setIsVideoMuted(next);
    }
  };

  return (
    <div className="video-call-container">
      <div className="video-grid">
        {/* Свое видео */}
        <div className="video-item">
          <video ref={localVideoRef} autoPlay muted />
          <div className="user-name-overlay">{userName || 'Вы'}</div>
          <div className="media-badges">
            <span className={`badge ${isAudioMuted ? 'muted' : ''}`}>
              <i className={`fas ${isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </span>
            <span className={`badge ${isVideoMuted ? 'muted' : ''}`}>
              <i className={`fas ${isVideoMuted ? 'fa-video-slash' : 'fa-video'}`} />
            </span>
          </div>
          {/* Если видео отключено – затемняющий оверлей с иконкой камеры */}
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
        {/* Потоки видео остальных участников */}
        {Object.entries(remoteStreams).map(([sessionId, stream]) => (
          <VideoPlayer
            key={sessionId}
            stream={stream}
            mediaStatus={remoteMediaStatus[sessionId]}
            userName={remoteUserNames[sessionId]}
          />
        ))}
      </div>
    </div>
  );
}

function VideoPlayer({ stream, mediaStatus, userName }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="video-item">
      <video ref={videoRef} autoPlay muted={!mediaStatus?.audioEnabled} />
      <div className="user-name-overlay">{userName || 'Пользователь'}</div>
      <div className="media-badges">
        <span className={`badge ${mediaStatus?.audioEnabled === false ? 'muted' : ''}`}>
          <i className={`fas ${mediaStatus?.audioEnabled === false ? 'fa-microphone-slash' : 'fa-microphone'}`} />
        </span>
        <span className={`badge ${mediaStatus?.videoEnabled === false ? 'muted' : ''}`}>
          <i className={`fas ${mediaStatus?.videoEnabled === false ? 'fa-video-slash' : 'fa-video'}`} />
        </span>
      </div>
      {mediaStatus?.videoEnabled === false && (
        <div className="video-muted-overlay">
          <i className="fas fa-video-slash" />
        </div>
      )}
    </div>
  );
}

export default VideoCall;
