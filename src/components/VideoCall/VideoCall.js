import './VideoCall.css';
import React, { useRef, useState, useEffect, useContext } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';

function VideoCall() {
  const socket = useContext(WebSocketContext);
  const currentUserId = '1'; // Замените на реальный ID пользователя
  const [userIdToCall, setUserIdToCall] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  useEffect(() => {
    peerConnectionRef.current = new RTCPeerConnection();

    // Получение медиа (аудио/видео)
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => {
          peerConnectionRef.current.addTrack(track, stream);
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((error) => console.error('Ошибка получения медиа:', error));

    // Обработка удаленных медиа-треков
    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Обработка ICE кандидатов
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: 'candidate',
            userId: currentUserId,
            candidate: event.candidate,
          })
        );
      }
    };

    return () => {
      peerConnectionRef.current.close();
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleSocketMessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'call') {
        await handleCall(data);
      } else if (data.type === 'answer') {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      } else if (data.type === 'candidate' && data.candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    };

    socket.addEventListener('message', handleSocketMessage);

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
    };
  }, [socket]);

  const callUser = async () => {
    if (!userIdToCall) {
      alert('Введите ID пользователя для вызова');
      return;
    }

    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);

    socket.send(
      JSON.stringify({
        type: 'call',
        userId: userIdToCall,
        offer: offer,
        callerId: currentUserId,
      })
    );
  };

  const handleCall = async (data) => {
    await peerConnectionRef.current.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);

    socket.send(
      JSON.stringify({
        type: 'answer',
        userId: data.callerId,
        answer: answer,
        receiverId: currentUserId,
      })
    );
  };

  return (
    <div className="video-call-container">
    <div className="video-container">
      <video
        ref={localVideoRef}
        autoPlay
        muted
        className="local-video"
      ></video>
      <video
        ref={remoteVideoRef}
        autoPlay
        className="remote-video"
      ></video>
    </div>
    <div className="call-controls">
      {/* Здесь можно добавить кнопки управления звонком */}
    </div>
  </div>
  );
}

export default VideoCall;
