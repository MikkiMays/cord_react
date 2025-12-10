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
  const userNameRef = useRef(userName);
  const onLeaveRef = useRef(onLeave);
  const pendingCandidatesRef = useRef({}); // Кандидаты, пришедшие до установки remote description

  // State для UI
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState({});
  const [isAudioMuted, setIsAudioMuted] = useState(!initialAudioEnabled);
  const [isVideoMuted, setIsVideoMuted] = useState(!initialVideoEnabled);
  const [isTogglingAudio, setIsTogglingAudio] = useState(false);
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);

  // Синхронизируем refs
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  /**
   * Отправка JSON через WebSocket (стабильная функция через ref)
   */
  const sendMessage = useCallback((data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  /**
   * Отправка статуса медиа на сервер
   */
  const sendMediaStatus = useCallback((audioEnabled, videoEnabled) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && clientIdRef.current) {
      sendMessage({
        type: 'media-status',
        audioEnabled,
        videoEnabled,
      });
    }
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
    // Очищаем pending candidates
    delete pendingCandidatesRef.current[sessionId];
    
    setRemoteStreams((prev) => {
      const updated = { ...prev };
      delete updated[sessionId];
      return updated;
    });
  }, []);

  /**
   * Создание RTCPeerConnection
   */
  const createPeerConnection = useCallback((sessionId) => {
    if (peerConnectionsRef.current[sessionId]) {
      console.log(`PeerConnection for ${sessionId} already exists`);
      return peerConnectionsRef.current[sessionId];
    }

    console.log(`Creating PeerConnection for ${sessionId}`);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate for ${sessionId}`, event.candidate.type);
        sendMessage({
          type: 'candidate',
          candidate: event.candidate.toJSON(),
          receiver: sessionId,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Received track from ${sessionId}:`, event.track.kind, 'streams:', event.streams.length);
      if (event.streams && event.streams[0]) {
        setRemoteStreams((prev) => ({
          ...prev,
          [sessionId]: event.streams[0],
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state ${sessionId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`ICE connection with ${sessionId} failed, attempting restart`);
        pc.restartIce();
      }
      if (pc.iceConnectionState === 'disconnected') {
        console.warn(`ICE connection with ${sessionId} disconnected`);
      }
      if (pc.iceConnectionState === 'connected') {
        console.log(`ICE connection with ${sessionId} established successfully!`);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state ${sessionId}: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        console.log(`WebRTC connection with ${sessionId} is fully connected!`);
      }
    };

    pc.onnegotiationneeded = () => {
      console.log(`Negotiation needed for ${sessionId}`);
    };

    // Добавляем локальные треки если они есть
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log(`Adding ${tracks.length} local tracks to PeerConnection ${sessionId}`);
      tracks.forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn(`Local stream not ready when creating PeerConnection for ${sessionId}`);
    }

    peerConnectionsRef.current[sessionId] = pc;
    return pc;
  }, [sendMessage]);

  /**
   * Добавление отложенных ICE candidates
   */
  const addPendingCandidates = useCallback(async (sessionId) => {
    const pending = pendingCandidatesRef.current[sessionId];
    if (pending && pending.length > 0) {
      const pc = peerConnectionsRef.current[sessionId];
      if (pc && pc.remoteDescription) {
        console.log(`Adding ${pending.length} pending ICE candidates for ${sessionId}`);
        for (const candidate of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn(`Error adding pending candidate:`, e);
          }
        }
        delete pendingCandidatesRef.current[sessionId];
      }
    }
  }, []);

  /**
   * Инициация WebRTC (отправка offer)
   */
  const initiateWebRTC = useCallback(async (sessionId) => {
    try {
      console.log(`Initiating WebRTC to ${sessionId}, local stream:`, !!localStreamRef.current);
      
      // Ждём немного, чтобы медиа успело инициализироваться
      if (!localStreamRef.current) {
        console.log(`Waiting for media initialization before creating offer for ${sessionId}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!localStreamRef.current) {
        console.error(`Cannot initiate WebRTC to ${sessionId} - no local stream`);
        return;
      }

      const pc = createPeerConnection(sessionId);
      
      // Убеждаемся, что треки добавлены
      if (pc.getSenders().length === 0) {
        console.log(`Adding tracks before creating offer for ${sessionId}`);
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      console.log(`Creating offer for ${sessionId}...`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      console.log(`Setting local description for ${sessionId}...`);
      await pc.setLocalDescription(offer);
      
      sendMessage({
        type: 'offer',
        offer: pc.localDescription.toJSON(),
        receiver: sessionId,
      });
      console.log(`Sent offer to ${sessionId}`);
    } catch (error) {
      console.error(`Error creating offer for ${sessionId}:`, error);
    }
  }, [createPeerConnection, sendMessage]);

  /**
   * Обработка offer
   */
  const handleOffer = useCallback(async (offer, senderId) => {
    try {
      console.log(`Received offer from ${senderId}`);
      const pc = createPeerConnection(senderId);
      
      // Убеждаемся, что треки добавлены перед ответом
      if (localStreamRef.current && pc.getSenders().length === 0) {
        console.log(`Adding tracks before creating answer for ${senderId}`);
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      console.log(`Setting remote description for ${senderId}...`);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Добавляем отложенные кандидаты
      await addPendingCandidates(senderId);
      
      console.log(`Creating answer for ${senderId}...`);
      const answer = await pc.createAnswer();
      
      console.log(`Setting local description (answer) for ${senderId}...`);
      await pc.setLocalDescription(answer);
      
      sendMessage({
        type: 'answer',
        answer: pc.localDescription.toJSON(),
        receiver: senderId,
      });
      console.log(`Sent answer to ${senderId}`);
    } catch (error) {
      console.error(`Error handling offer from ${senderId}:`, error);
    }
  }, [createPeerConnection, sendMessage, addPendingCandidates]);

  /**
   * Обработка answer
   */
  const handleAnswer = useCallback(async (answer, senderId) => {
    try {
      console.log(`Received answer from ${senderId}`);
      const pc = peerConnectionsRef.current[senderId];
      if (!pc) {
        console.warn(`PeerConnection for ${senderId} not found`);
        return;
      }
      
      if (pc.signalingState === 'have-local-offer') {
        console.log(`Setting remote description (answer) for ${senderId}...`);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Добавляем отложенные кандидаты
        await addPendingCandidates(senderId);
        
        console.log(`Answer processed for ${senderId}, state: ${pc.signalingState}`);
      } else {
        console.log(`Skipping answer for ${senderId}, signaling state: ${pc.signalingState}`);
      }
    } catch (error) {
      console.error(`Error handling answer from ${senderId}:`, error);
    }
  }, [addPendingCandidates]);

  /**
   * Обработка ICE candidate
   */
  const handleCandidate = useCallback(async (candidate, senderId) => {
    try {
      const pc = peerConnectionsRef.current[senderId];
      
      if (!pc) {
        console.log(`Storing candidate for ${senderId} (no PeerConnection yet)`);
        if (!pendingCandidatesRef.current[senderId]) {
          pendingCandidatesRef.current[senderId] = [];
        }
        pendingCandidatesRef.current[senderId].push(candidate);
        return;
      }
      
      if (!pc.remoteDescription) {
        console.log(`Storing candidate for ${senderId} (no remote description yet)`);
        if (!pendingCandidatesRef.current[senderId]) {
          pendingCandidatesRef.current[senderId] = [];
        }
        pendingCandidatesRef.current[senderId].push(candidate);
        return;
      }
      
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`ICE candidate added for ${senderId}`);
    } catch (error) {
      if (error.name !== 'InvalidStateError') {
        console.error(`ICE candidate error for ${senderId}:`, error);
      }
    }
  }, []);

  /**
   * Инициализация медиа и setup WebSocket
   * ВАЖНО: минимум зависимостей чтобы не было лишних cleanup!
   */
  useEffect(() => {
    if (!socket) {
      console.log('VideoCall: No socket, waiting...');
      return;
    }

    let mounted = true;
    disconnectingRef.current = false;
    nameSentRef.current = false;

    console.log('VideoCall: Initializing media...');

    // Проверяем поддержку mediaDevices
    const isMediaDevicesSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    
    if (!isMediaDevicesSupported) {
      console.warn('mediaDevices API недоступен.');
      setIsAudioMuted(true);
      setIsVideoMuted(true);
      return;
    }

    // Запрашиваем медиа (с обработкой частично доступных устройств)
    const requestMedia = async () => {
      try {
        let stream;
        let audioAvailable = false;
        let videoAvailable = false;
        
        try {
          // Пытаемся получить оба устройства
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          audioAvailable = stream.getAudioTracks().length > 0;
          videoAvailable = stream.getVideoTracks().length > 0;
          console.log('VideoCall: Оба устройства получены:', { audio: audioAvailable, video: videoAvailable });
        } catch (err) {
          // Если не удалось получить оба, пробуем по отдельности
          console.log('VideoCall: Не удалось получить оба устройства, пробуем по отдельности...', err.name);
          
          const tracks = [];
          
          // Пробуем получить аудио
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tracks.push(...audioStream.getAudioTracks());
            audioAvailable = true;
            console.log('VideoCall: Аудио получено');
            audioStream.getVideoTracks().forEach(t => t.stop());
          } catch (audioErr) {
            console.warn('VideoCall: Не удалось получить аудио:', audioErr.name);
          }
          
          // Пробуем получить видео
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tracks.push(...videoStream.getVideoTracks());
            videoAvailable = true;
            console.log('VideoCall: Видео получено');
            videoStream.getAudioTracks().forEach(t => t.stop());
          } catch (videoErr) {
            console.warn('VideoCall: Не удалось получить видео:', videoErr.name);
          }
          
          // Создаем новый поток из полученных треков
          if (tracks.length > 0) {
            stream = new MediaStream(tracks);
            console.log('VideoCall: Создан поток из отдельных треков:', tracks.length);
          } else {
            throw new Error('Не удалось получить ни одно устройство');
          }
        }
        
        if (!mounted) {
          console.log('VideoCall: Component unmounted, stopping stream');
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (!stream || stream.getTracks().length === 0) {
          throw new Error('Не удалось получить доступ к медиа-устройствам');
        }

        console.log('VideoCall: Media obtained:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

        localStreamRef.current = stream;
        if (localVideoRef.current && videoAvailable) {
          localVideoRef.current.srcObject = stream;
        }

        // Применяем начальные настройки (только для доступных устройств)
        let finalAudioEnabled = initialAudioEnabled && audioAvailable;
        let finalVideoEnabled = initialVideoEnabled && videoAvailable;
        
        if (audioAvailable) {
          stream.getAudioTracks().forEach((t) => { 
            t.enabled = finalAudioEnabled;
          });
        }
        
        if (videoAvailable) {
          stream.getVideoTracks().forEach((t) => { 
            t.enabled = finalVideoEnabled;
          });
        }
        
        setIsAudioMuted(!finalAudioEnabled);
        setIsVideoMuted(!finalVideoEnabled);
        mediaInitializedRef.current = true;
        
        console.log(`VideoCall: Media initialized, audio=${finalAudioEnabled}, video=${finalVideoEnabled}`);
        
        // Отправляем начальный статус медиа
        if (socketRef.current?.readyState === WebSocket.OPEN && clientIdRef.current) {
          socketRef.current.send(JSON.stringify({
            type: 'media-status',
            audioEnabled: finalAudioEnabled,
            videoEnabled: finalVideoEnabled,
          }));
        }

        // Добавляем треки ко всем существующим PeerConnections
        Object.entries(peerConnectionsRef.current).forEach(([sessionId, pc]) => {
          if (pc.getSenders().length === 0) {
            console.log(`Adding tracks to existing PeerConnection ${sessionId}`);
            stream.getTracks().forEach((track) => {
              pc.addTrack(track, stream);
            });
          }
        });
      } catch (error) {
        console.error('VideoCall: Error obtaining media:', error);
        setIsAudioMuted(true);
        setIsVideoMuted(true);
      }
    };
    
    requestMedia();

    // Cleanup функция
    return () => {
      console.log('VideoCall: Cleanup starting...');
      mounted = false;
      
      // Отправляем leave только если socket ещё открыт
      if (!disconnectingRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
        disconnectingRef.current = true;
        try {
          socketRef.current.send(JSON.stringify({ type: 'leave' }));
          console.log('VideoCall: Sent leave message');
        } catch (e) {
          console.warn('VideoCall: Could not send leave:', e);
        }
      }
      
      // Останавливаем локальный стрим
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      mediaInitializedRef.current = false;
      
      // Закрываем все peer connections
      Object.keys(peerConnectionsRef.current).forEach((sessionId) => {
        const pc = peerConnectionsRef.current[sessionId];
        if (pc) {
          pc.close();
          delete peerConnectionsRef.current[sessionId];
        }
      });
      
      console.log('VideoCall: Cleanup complete');
    };
  // ВАЖНО: только socket в зависимостях!
  // initialAudioEnabled и initialVideoEnabled используем через замыкание
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

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
          console.log('My ID:', myId);
          clientIdRef.current = myId;

          // Отправляем set-name один раз
          if (!nameSentRef.current) {
            nameSentRef.current = true;
            sendMessage({ type: 'set-name', name: userNameRef.current });
            console.log('Sent set-name:', userNameRef.current);
            
            // Отправляем начальный статус медиа после регистрации
            setTimeout(() => {
              if (mediaInitializedRef.current) {
                const audioEnabled = localStreamRef.current?.getAudioTracks()[0]?.enabled ?? false;
                const videoEnabled = localStreamRef.current?.getVideoTracks()[0]?.enabled ?? false;
                sendMessage({
                  type: 'media-status',
                  audioEnabled,
                  videoEnabled,
                });
              }
            }, 100);
          }
          break;
        }

        case 'participants': {
          const items = data.items || [];
          const myId = clientIdRef.current;

          console.log('Received participants list:', items.length, 'my ID:', myId);

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
          console.log('Participants (excluding self):', Object.keys(map).length);
          break;
        }

        case 'new-user': {
          if (data.sessionId !== clientIdRef.current) {
            console.log('New participant, initiating WebRTC:', data.sessionId, 'name:', data.userName);
            // Небольшая задержка чтобы медиа успело инициализироваться
            setTimeout(() => {
              initiateWebRTC(data.sessionId);
            }, 500);
          }
          break;
        }

        case 'user-left': {
          const leftId = data.sessionId;
          console.log('Participant left:', leftId);
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
      console.log('VideoCall: WebSocket closed');
      if (!disconnectingRef.current) {
        onLeaveRef.current?.();
      }
    };

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);

    return () => {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
    };
  }, [socket, sendMessage, initiateWebRTC, handleOffer, handleAnswer, handleCandidate, closePeerConnection]);

  /**
   * Передаём список участников в родительский компонент
   */
  useEffect(() => {
    const list = Object.entries(participants).map(([id, data]) => ({
      id,
      name: data.userName || 'Участник',
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled,
    }));
    onParticipantsChange?.(list);
  }, [participants, onParticipantsChange]);

  /**
   * Уведомляем родителя о локальном медиа
   */
  useEffect(() => {
    onLocalMediaChange?.(!isAudioMuted, !isVideoMuted);
  }, [isAudioMuted, isVideoMuted, onLocalMediaChange]);

  /**
   * Переключение микрофона
   */
  const toggleAudio = useCallback(async () => {
    if (isTogglingAudio) return;
    
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('toggleAudio: Local stream not initialized');
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('toggleAudio: No audio tracks');
      return;
    }

    setIsTogglingAudio(true);
    
    try {
      // Получаем текущее состояние
      const currentEnabled = audioTracks[0].enabled;
      const newEnabled = !currentEnabled;

      // Переключаем состояние всех аудио треков
      audioTracks.forEach((track) => {
        track.enabled = newEnabled;
      });

      // Обновляем состояние UI
      setIsAudioMuted(!newEnabled);
      console.log(`toggleAudio: ${newEnabled ? 'unmuted' : 'muted'}`);
      
      // Отправляем статус на сервер
      sendMediaStatus(newEnabled, !isVideoMuted);
    } finally {
      setIsTogglingAudio(false);
    }
  }, [isTogglingAudio, isVideoMuted, sendMediaStatus]);

  /**
   * Переключение камеры
   */
  const toggleVideo = useCallback(async () => {
    if (isTogglingVideo) return;
    
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('toggleVideo: Local stream not initialized');
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn('toggleVideo: No video tracks');
      return;
    }

    setIsTogglingVideo(true);
    
    try {
      // Получаем текущее состояние
      const currentEnabled = videoTracks[0].enabled;
      const newEnabled = !currentEnabled;

      // Переключаем состояние всех видео треков
      videoTracks.forEach((track) => {
        track.enabled = newEnabled;
      });

      // Обновляем состояние UI
      setIsVideoMuted(!newEnabled);
      console.log(`toggleVideo: ${newEnabled ? 'enabled' : 'disabled'}`);
      
      // Отправляем статус на сервер
      sendMediaStatus(!isAudioMuted, newEnabled);
    } finally {
      setIsTogglingVideo(false);
    }
  }, [isTogglingVideo, isAudioMuted, sendMediaStatus]);

  /**
   * Выход из встречи
   */
  const leaveMeeting = useCallback(() => {
    console.log('VideoCall: Leaving meeting...');
    disconnectingRef.current = true;
    
    // Отправляем leave
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'leave' }));
      } catch (e) {
        console.warn('Could not send leave:', e);
      }
    }
    
    // Закрываем все peer connections
    Object.keys(peerConnectionsRef.current).forEach((sessionId) => {
      const pc = peerConnectionsRef.current[sessionId];
      if (pc) {
        pc.close();
        delete peerConnectionsRef.current[sessionId];
      }
    });
    
    setRemoteStreams({});
    setParticipants({});
    onLeaveRef.current?.();
  }, []);

  /**
   * beforeunload
   */
  useEffect(() => {
    const handler = () => {
      disconnectingRef.current = true;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ type: 'leave' }));
        } catch (e) {
          // ignore
        }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

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
            <button 
              onClick={toggleAudio} 
              disabled={isTogglingAudio}
              className={isAudioMuted ? 'muted-btn' : ''}
              title={isAudioMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              <i className={`fas ${isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </button>
            <button 
              onClick={toggleVideo} 
              disabled={isTogglingVideo}
              className={isVideoMuted ? 'muted-btn' : ''}
              title={isVideoMuted ? 'Включить камеру' : 'Выключить камеру'}
            >
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
      console.log('ParticipantTile: Set stream for', participant?.userName);
    }
  }, [stream, participant?.userName]);

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
