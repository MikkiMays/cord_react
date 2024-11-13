import React, { useState } from 'react';
import Chat from '../Chat/Chat';
import VideoCall from '../VideoCall/VideoCall';
import JoinMeeting from './JoinMeeting/JoinMeeting';
import './Meeting.css';
import { useParams } from 'react-router-dom';
import { WebSocketProvider } from '../../contexts/WebSocketContext';

function Meeting() {
  const { meetingId } = useParams();
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);

  const handleJoin = (name) => {
    setUserName(name);
    setJoined(true);
  };

  return (
    <WebSocketProvider meetingId={meetingId}>
      {!joined ? (
        <JoinMeeting onJoin={handleJoin} />
      ) : (
        <div className="meeting-container">
          <div className="chat-section">
            <Chat userName={userName} />
          </div>
          <div className="video-section">
            <VideoCall userName={userName} />
          </div>
        </div>
      )}
    </WebSocketProvider>
  );
}

export default Meeting;
