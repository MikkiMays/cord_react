import React, { useRef, useState, useEffect, useContext } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';
import './VideoCall.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function VideoCall({ userName }) {
  const socket = useContext(WebSocketContext);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [clientId, setClientId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const peerConnections = useRef({});
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [remoteMediaStatus, setRemoteMediaStatus] = useState({});
  const [remoteUserNames, setRemoteUserNames] = useState({});

  const handleMediaStatus = (sender, audioEnabled, videoEnabled) => {
    setRemoteMediaStatus((prevStatus) => ({
      ...prevStatus,
      [sender]: {
        audioEnabled: audioEnabled !== undefined ? audioEnabled : prevStatus[sender]?.audioEnabled,
        videoEnabled: videoEnabled !== undefined ? videoEnabled : prevStatus[sender]?.videoEnabled,
      },
    }));
  };

  useEffect(() => {
    // Получение локального медиапотока
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Отправляем сообщение о присоединении
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'join' }));
        } else if (socket) {
          socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ type: 'join' }));
          });
        }
      })
      .catch((error) => {
        console.error('Ошибка получения медиа:', error);
        alert('Необходимо предоставить доступ к камере и микрофону для участия в видеовстрече.');
      });

    return () => {
      // Очистка при размонтировании
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setRemoteMediaStatus({});
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleSocketMessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('Получено сообщение:', data);

      const { type, sender, sessionId } = data;

      switch (type) {
        case 'your-id':
          setClientId(sessionId);
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'set-name',
                name: userName,
                sessionId: sessionId,
              })
            );
          }
          break;

        case 'new-user':
          await handleNewUser(data.sessionId, data.userName);
          break;
        case 'offer':
          await handleOffer(data.offer, sender);
          break;
        case 'answer':
          await handleAnswer(data.answer, sender);
          break;
        case 'candidate':
          await handleCandidate(data.candidate, sender);
          break;
        case 'user-left':
          handleUserLeft(sessionId);
          break;
        case 'media-status':
          handleMediaStatus(sender, data.audioEnabled, data.videoEnabled);
          break;
        default:
          break;
      }
    };

    socket.addEventListener('message', handleSocketMessage);

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
    };
  }, [socket]);

  const createPeerConnection = (sessionId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Публичный STUN сервер Google
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && clientId) {
        socket.send(
          JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
            sender: clientId,
            receiver: sessionId,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prevStreams) => ({
        ...prevStreams,
        [sessionId]: event.streams[0],
      }));
    };

    // Добавляем локальные треки в соединение
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    return pc;
  };

  const handleNewUser = async (sessionId, userName) => {
    // Сохраняем имя пользователя
    setRemoteUserNames((prevNames) => ({
      ...prevNames,
      [sessionId]: userName,
    }));

    // Создаём соединение
    const pc = createPeerConnection(sessionId);
    peerConnections.current[sessionId] = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (clientId) {
      socket.send(
        JSON.stringify({
          type: 'offer',
          offer: pc.localDescription,
          sender: clientId,
          receiver: sessionId,
        })
      );
    }
  };


  const handleOffer = async (offer, sender) => {
    const pc = createPeerConnection(sender);
    peerConnections.current[sender] = pc;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (clientId) {
      socket.send(
        JSON.stringify({
          type: 'answer',
          answer: pc.localDescription,
          sender: clientId,
          receiver: sender,
        })
      );
    }
  };

  const handleAnswer = async (answer, sender) => {
    const pc = peerConnections.current[sender];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleCandidate = async (candidate, sender) => {
    const pc = peerConnections.current[sender];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const handleUserLeft = (sessionId) => {
    const pc = peerConnections.current[sessionId];
    if (pc) {
      pc.close();
      delete peerConnections.current[sessionId];
    }
    setRemoteStreams((prevStreams) => {
      const updatedStreams = { ...prevStreams };
      delete updatedStreams[sessionId];
      return updatedStreams;
    });
    setRemoteMediaStatus((prevStatus) => {
      const updatedStatus = { ...prevStatus };
      delete updatedStatus[sessionId];
      return updatedStatus;
    });
    setRemoteUserNames((prevNames) => {
      const updatedNames = { ...prevNames };
      delete updatedNames[sessionId];
      return updatedNames;
    });
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);

      if (socket && socket.readyState === WebSocket.OPEN && clientId) {
        // Отправляем сообщение о статусе микрофона
        socket.send(
          JSON.stringify({
            type: 'media-status',
            sender: clientId,
            audioEnabled: !isAudioMuted,
          })
        );
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(!isVideoMuted);

      if (socket && socket.readyState === WebSocket.OPEN && clientId) {
        // Отправляем сообщение о статусе камеры
        socket.send(
          JSON.stringify({
            type: 'media-status',
            sender: clientId,
            videoEnabled: !isVideoMuted,
          })
        );
      }
    }
  };

  return (
    <div className="video-call-container">
      <div className="video-grid">
        <div className="video-item">
          <video ref={localVideoRef} autoPlay muted />
          <div className="user-name-overlay">
            {userName || 'Вы'}
          </div>
          {/* Добавим кнопки управления */}
          <div className="controls">
            <button onClick={toggleAudio}>
              <i className={`fas ${isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
            </button>
            <button onClick={toggleVideo}>
              <i className={`fas ${isVideoMuted ? 'fa-video-slash' : 'fa-video'}`}></i>
            </button>
          </div>
        </div>
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
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-item">
      <video ref={videoRef} autoPlay muted={!mediaStatus?.audioEnabled} />
      <div className="user-name-overlay">
        {userName || 'Пользователь'}
      </div>
      {!mediaStatus?.videoEnabled && (
        <div className="video-muted-overlay">
          <i className="fas fa-video-slash"></i>
        </div>
      )}
    </div>
  );
}

export default VideoCall;
