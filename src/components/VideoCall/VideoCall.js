import React, { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';
import './VideoCall.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function VideoCall({
  userName,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
  onParticipantsChange,
  onLocalMediaChange,
  onLeave,
}) {
  const socket = useContext(WebSocketContext);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const joinSentRef = useRef(false);
  const disconnectingRef = useRef(false);

  const [clientId, setClientId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteUserNames, setRemoteUserNames] = useState({});
  const [remoteMediaStatus, setRemoteMediaStatus] = useState({});
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const broadcastMediaStatus = useCallback((status) => {
    if (socket?.readyState === WebSocket.OPEN && clientId) {
      socket.send(JSON.stringify({ type: 'media-status', ...status }));
    }
  }, [socket, clientId]);

  const sendLeave = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      disconnectingRef.current = true;
      socket.send(JSON.stringify({ type: 'leave' }));
    }
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;
    let mounted = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!mounted) return;
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        if (!initialAudioEnabled) {
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setIsAudioMuted(true);
        }
        if (!initialVideoEnabled) {
          stream.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });
          setIsVideoMuted(true);
        }

        const tryJoin = () => {
          if (!socket || joinSentRef.current) return;
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'join' }));
            joinSentRef.current = true;
          } else {
            socket.addEventListener('open', tryJoin, { once: true });
          }
        };

        tryJoin();
      })
      .catch((error) => {
        console.error('Ошибка получения медиа:', error);
        alert('Не удалось получить доступ к камере/микрофону. Проверьте настройки устройств.');
      });

    return () => {
      mounted = false;
      sendLeave();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setRemoteUserNames({});
      setRemoteMediaStatus({});
    };
  }, [socket, initialAudioEnabled, initialVideoEnabled, sendLeave]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleClose = () => {
      if (!disconnectingRef.current) {
        onLeave?.();
      }
    };
    socket.addEventListener('close', handleClose);
    return () => socket.removeEventListener('close', handleClose);
  }, [socket, onLeave]);

  const createPeerConnection = useCallback((sessionId) => {
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

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }
    return pc;
  }, [clientId, socket]);

  const handleNewUser = useCallback(async (newSessionId) => {
    const pc = createPeerConnection(newSessionId);
    peerConnections.current[newSessionId] = pc;
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
  }, [clientId, createPeerConnection, socket]);

  const handleOffer = useCallback(async (offer, senderId) => {
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
  }, [clientId, createPeerConnection, socket]);

  const handleAnswer = useCallback(async (answer, senderId) => {
    const pc = peerConnections.current[senderId];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleCandidate = useCallback(async (candidate, senderId) => {
    const pc = peerConnections.current[senderId];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const handleUserLeft = useCallback((sessionId) => {
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
  }, []);

  const handleMediaStatus = useCallback((senderId, audioEnabled, videoEnabled) => {
    setRemoteMediaStatus((prevStatus) => ({
      ...prevStatus,
      [senderId]: {
        audioEnabled:
          audioEnabled !== undefined ? audioEnabled : prevStatus[senderId]?.audioEnabled ?? true,
        videoEnabled:
          videoEnabled !== undefined ? videoEnabled : prevStatus[senderId]?.videoEnabled ?? true,
      },
    }));
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const handleSocketMessage = async (event) => {
      const data = JSON.parse(event.data);
      const { type, sender, sessionId } = data;
      if (data.receiver && data.receiver !== clientId) return;

      switch (type) {
        case 'your-id': {
          const myId = data.sessionId;
          setClientId(myId);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'set-name', name: userName, sessionId: myId }));
            broadcastMediaStatus({
              audioEnabled: !isAudioMuted,
              videoEnabled: !isVideoMuted,
            });
          }
          break;
        }
        case 'participants': {
          const items = data.items || [];
          const initialNames = {};
          const initialStatuses = {};
          items.forEach((participant) => {
            initialNames[participant.sessionId] = participant.userName;
            initialStatuses[participant.sessionId] = {
              audioEnabled: participant.audioEnabled !== false,
              videoEnabled: participant.videoEnabled !== false,
            };
          });
          setRemoteUserNames(initialNames);
          setRemoteMediaStatus(initialStatuses);
          break;
        }
        case 'new-user': {
          setRemoteUserNames((prev) => ({
            ...prev,
            [data.sessionId]: data.userName,
          }));
          setRemoteMediaStatus((prev) => ({
            ...prev,
            [data.sessionId]: {
              audioEnabled: true,
              videoEnabled: true,
            },
          }));
          await handleNewUser(data.sessionId);
          break;
        }
        case 'user-left': {
          handleUserLeft(sessionId);
          break;
        }
        case 'media-status': {
          handleMediaStatus(sender, data.audioEnabled, data.videoEnabled);
          break;
        }
        case 'set-name': {
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
  }, [
    socket,
    userName,
    isAudioMuted,
    isVideoMuted,
    clientId,
    broadcastMediaStatus,
    handleNewUser,
    handleUserLeft,
    handleMediaStatus,
    handleOffer,
    handleAnswer,
    handleCandidate,
  ]);

  useEffect(() => {
    const participantsList = Object.entries(remoteUserNames).map(([id, name]) => ({
      id,
      name: name || 'Участник',
      audioEnabled: remoteMediaStatus[id]?.audioEnabled !== false,
      videoEnabled: remoteMediaStatus[id]?.videoEnabled !== false,
    }));
    onParticipantsChange?.(participantsList);
  }, [remoteUserNames, remoteMediaStatus, onParticipantsChange]);

  useEffect(() => {
    onLocalMediaChange?.(!isAudioMuted, !isVideoMuted);
    if (clientId && socket?.readyState === WebSocket.OPEN) {
      broadcastMediaStatus({
        audioEnabled: !isAudioMuted,
        videoEnabled: !isVideoMuted,
      });
    }
  }, [isAudioMuted, isVideoMuted, clientId, broadcastMediaStatus, onLocalMediaChange, socket]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const next = !isAudioMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      setIsAudioMuted(next);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const next = !isVideoMuted;
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      setIsVideoMuted(next);
    }
  };

  const leaveMeeting = useCallback(() => {
    sendLeave();
    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};
    setRemoteStreams({});
    setRemoteMediaStatus({});
    setRemoteUserNames({});
    onLeave?.();
  }, [onLeave, sendLeave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendLeave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sendLeave]);

  const participantIds = Array.from(
    new Set([...Object.keys(remoteUserNames), ...Object.keys(remoteStreams)])
  );

  return (
    <div className="video-call-container">
      <div className="video-grid">
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

        {participantIds.map((sessionId) => (
          <ParticipantTile
            key={sessionId}
            stream={remoteStreams[sessionId]}
            mediaStatus={remoteMediaStatus[sessionId]}
            userName={remoteUserNames[sessionId]}
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

function ParticipantTile({ stream, mediaStatus, userName }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-item">
      {stream ? (
        <video ref={videoRef} autoPlay muted={!mediaStatus?.audioEnabled} />
      ) : (
        <div className="video-placeholder">{(userName || 'Участник').charAt(0).toUpperCase()}</div>
      )}
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
