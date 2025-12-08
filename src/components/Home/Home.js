import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import './Home.css';
import { createMeeting } from '../../services/api';

function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(false);
  const displayName = name.trim() || 'Гость';

  const goToMeeting = (id, options = {}) => {
    navigate(`/meeting/${id}`, { state: { name: displayName, ...options } });
  };

  const handleCreateMeeting = async () => {
    setLoading(true);
    try {
      const meeting = await createMeeting({ hostName: displayName });
      goToMeeting(meeting.id || meeting.meetingId, { autoJoin: false });
    } catch (error) {
      console.warn('Failed to call meeting creation API, using local ID', error);
      goToMeeting(uuidv4(), { autoJoin: false });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMeeting = () => {
    if (!meetingId.trim()) {
      alert('Введите идентификатор встречи');
      return;
    }
    goToMeeting(meetingId.trim(), { autoJoin: false });
  };

  return (
    <div className="home-hero">
      <div className="home-card">
        <div className="home-header">
          <p className="badge">Видеовстречи</p>
          <h1>Создавайте и присоединяйтесь к встречам как в Google Meet</h1>
          <p className="subtitle">
            Используйте готовые роуты из cord: создайте новую встречу, пришлите ссылку коллегам и
            заходите с любого устройства.
          </p>
        </div>

        <div className="home-grid">
          <div className="panel">
            <h3>Создать встречу</h3>
            <p className="helper">Мы попробуем вызвать backend /api/meetings. Если он недоступен, сгенерируем ID локально.</p>
            <label className="field-label" htmlFor="creator-name">Ваше имя</label>
            <input
              id="creator-name"
              type="text"
              placeholder="Например, Мария Иванова"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary" onClick={handleCreateMeeting} disabled={loading}>
              {loading ? 'Создаём…' : 'Создать встречу'}
            </button>
          </div>

          <div className="panel">
            <h3>У меня есть приглашение</h3>
            <p className="helper">Введите код или ссылку на встречу, чтобы присоединиться.</p>
            <label className="field-label" htmlFor="meeting-code">ID встречи</label>
            <input
              id="meeting-code"
              type="text"
              placeholder="Например, 123e4567-e89b-12d3-a456-426614174000"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
            />
            <button className="ghost" onClick={handleJoinMeeting}>Присоединиться</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
