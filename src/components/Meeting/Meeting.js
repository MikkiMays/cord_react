import React from 'react';
import Chat from '../Chat/Chat';
import VideoCall from '../VideoCall/VideoCall';
import './Meeting.css';
import { useParams } from 'react-router-dom';
import { WebSocketProvider } from '../../contexts/WebSocketContext';

function Meeting() {
    const { meetingId } = useParams();
    
  return (
    <WebSocketProvider meetingId={meetingId}>
    <div className="meeting-container">
      <div className="chat-section">
        <Chat />
      </div>
      <div className="video-section">
        <VideoCall />
      </div>
    </div>
    </WebSocketProvider>
  );
}

export default Meeting;
