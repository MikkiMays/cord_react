// src/components/VideoCall.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import './VideoCall.css';
import { WebSocketContext } from '../context/WebSocketContext';

function VideoCall() {
  const wsRef = useContext(WebSocketContext); // Получаем WebSocket из контекста
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [username, setUsername] = useState('');
  const [connected, setConnected] = useState(false);

  const pcRef = useRef({});
  const localVideoRef = useRef(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Получаем параметры из URL (meetingId и username)
  const queryParams = new URLSearchParams(window.location.search);
  const meetingId = queryParams.get('meetingId');
  const userNameParam = queryParams.get('username');

  // Инициализация WebSocket и локального видео
  useEffect(() => {
    const userNamePrompt = userNameParam || prompt('Введите ваше имя:');
    setUsername(userNamePrompt);

    // Устанавливаем локальный видео-поток
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((error) => {
        console.error('Ошибка доступа к камере и микрофону:', error);
        alert('Необходимо предоставить доступ к камере и микрофону.');
      });

    if (wsRef.current) {
      wsRef.current.onmessage = (message) => {
        const data = JSON.parse(message.data);
        handleMessage(data);
      };

      wsRef.current.onopen = () => {
        console.log('WebSocket подключен');
        setConnected(true);
        wsRef.current.send(
          JSON.stringify({ type: 'set-name', name: userNamePrompt })
        );
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket отключен');
        setConnected(false);
      };
    }

    return () => {
      // Очищаем ресурсы при размонтировании
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream, userNameParam, wsRef]);

  // Обработка входящих сообщений WebSocket
  const handleMessage = async (data) => {
    const { type } = data;

    switch (type) {
      case 'your-id':
        // Сообщаем своё имя на сервер
        wsRef.current.send(
          JSON.stringify({
            type: 'set-name',
            name: username,
          })
        );
        break;
      case 'new-user':
        await handleNewUser(data.sessionId, data.userName);
        break;
      case 'offer':
        await handleOffer(data);
        break;
      case 'answer':
        await handleAnswer(data);
        break;
      case 'candidate':
        await handleCandidate(data);
        break;
      case 'user-left':
        handleUserLeft(data.sessionId);
        break;
      default:
        break;
    }
  };

  // Логика обработки нового пользователя
  const handleNewUser = async (sessionId, userName) => {
    const pc = createPeerConnection(sessionId, userName);

    // Создаем предложение (offer)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Отправляем предложение на сервер
    wsRef.current.send(
      JSON.stringify({
        type: 'offer',
        offer: pc.localDescription,
        receiver: sessionId,
      })
    );
  };

  // Создание RTCPeerConnection и обработка кандидатов
  const createPeerConnection = (sessionId, userName) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current.send(
          JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
            receiver: sessionId,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prevStreams) => ({
        ...prevStreams,
        [sessionId]: { stream: event.streams[0], userName },
      }));
    };

    // Добавляем локальный стрим в PeerConnection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    pcRef.current[sessionId] = pc;
    return pc;
  };

  // Обработка предложения от другого пользователя
  const handleOffer = async (data) => {
    const { sender, offer, userName } = data;
    const pc = createPeerConnection(sender, userName);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsRef.current.send(
      JSON.stringify({
        type: 'answer',
        answer: pc.localDescription,
        receiver: sender,
      })
    );
  };

  // Обработка ответа на наше предложение
  const handleAnswer = async (data) => {
    const { sender, answer } = data;
    const pc = pcRef.current[sender];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  // Обработка ICE-кандидатов
  const handleCandidate = async (data) => {
    const { sender, candidate } = data;
    const pc = pcRef.current[sender];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  // Обработка отключения пользователя
  const handleUserLeft = (sessionId) => {
    const pc = pcRef.current[sessionId];
    if (pc) {
      pc.close();
      delete pcRef.current[sessionId];
    }
    setRemoteStreams((prevStreams) => {
      const updatedStreams = { ...prevStreams };
      delete updatedStreams[sessionId];
      return updatedStreams;
    });
  };

  // Переключение микрофона
  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  // Переключение камеры
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(!isVideoMuted);
    }
  };

  return (
    <div className="videocall-container">
      <div className="videocall-local-video">
        <video ref={localVideoRef} autoPlay muted className="videocall-video" />
        <p>{username}</p>
      </div>

      <div className="videocall-remote-videos">
        {Object.entries(remoteStreams).map(([sessionId, data]) => (
          <div key={sessionId} className="videocall-remote-video">
            <VideoPlayer stream={data.stream} name={data.userName} />
          </div>
        ))}
      </div>

      <div className="videocall-controls">
        <button onClick={toggleAudio}>
          {isAudioMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        </button>
        <button onClick={toggleVideo}>
          {isVideoMuted ? 'Включить камеру' : 'Выключить камеру'}
        </button>
      </div>
    </div>
  );
}

// Компонент для отображения видео потока
function VideoPlayer({ stream, name }) {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div>
      <video ref={videoRef} autoPlay className="videocall-video" />
      <p>{name}</p>
    </div>
  );
}

export default VideoCall;
