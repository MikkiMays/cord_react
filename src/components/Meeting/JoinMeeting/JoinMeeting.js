import React, { useState } from 'react';
import VideoCall from '../../VideoCall/VideoCall';
import './JoinMeeting.css';

function JoinMeeting() {
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);

  const handleJoin = () => {
    if (userName.trim() !== '') {
      setJoined(true);
    } else {
      alert('Пожалуйста, введите ваше имя');
    }
  };

  if (joined) {
    return <VideoCall userName={userName} />;
  }

  return (
    <div className="join-meeting-container">
      <h2>Введите ваше имя для присоединения к встрече</h2>
      <input
        type="text"
        placeholder="Ваше имя"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
      />
      <button onClick={handleJoin}>Присоединиться</button>
    </div>
  );
}

export default JoinMeeting;
