import './Home.css';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

import React, { useState } from 'react';

function Home() {
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState('');

  const handleCreateMeeting = () => {
    const newMeetingId = uuidv4();
    navigate(`/meeting/${newMeetingId}`);
  };

  const handleJoinMeeting = () => {
    if (meetingId) {
      navigate(`/meeting/${meetingId}`);
    } else {
      alert('Введите идентификатор встречи');
    }
  };

  return (
    <div className="home-container">
      <button className="create-meeting-button" onClick={handleCreateMeeting}>
        Создать встречу
      </button>
      <div className="join-meeting">
        <input
          type="text"
          placeholder="Введите ID встречи"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
        />
        <button onClick={handleJoinMeeting}>Присоединиться к встрече</button>
      </div>
    </div>
  );
}


export default Home;
