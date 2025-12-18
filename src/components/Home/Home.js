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
    <div className="home-hero-premium">
      {/* фоновый glow */}
      <div className="hero-bg-glow hero-bg-glow-left" />
      <div className="hero-bg-glow hero-bg-glow-right" />

      <div className="home-inner">
        <header className="home-header">
          <p className="badge">Видеовстречи</p>
          <h1 className="hero-title">Cord — видеосвязь нового уровня.</h1>
          <p className="hero-subtitle">
            Создавайте комнаты за секунды, делитесь ID и подключайтесь с любого устройства —
            без скачивания и регистрации.
          </p>
          <p className="hero-quality">
            Качество, которого вы ещё не видели на других видеовстречах.
          </p>

          <div className="hero-meta-row">
            <span className="hero-chip">Мгновенное подключение</span>
            <span className="hero-chip">Умный сигнал через WebRTC</span>
            <span className="hero-chip">Работает в браузере</span>
          </div>
        </header>

        <section className="home-panels">
          {/* Создать встречу */}
          <div className="panel panel-main">
            <div className="panel-header">
              <h3>Создать встречу</h3>
              <p className="panel-helper">
                Мы создадим комнату и сгенерируем ID — просто отправьте его участникам.
              </p>
            </div>

            <div className="panel-fields">
              <label className="field-label" htmlFor="creator-name">
                Ваше имя (опционально)
              </label>
              <input
                id="creator-name"
                type="text"
                placeholder="Например, Мария Иванова"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <button
              className="btn primary"
              onClick={handleCreateMeeting}
              disabled={loading}
            >
              {loading ? 'Создаём…' : 'Создать встречу'}
            </button>

            <p className="panel-footnote">
                Мы не сохраняем ваши встречи — Cord создан для быстрых созвонов.
            </p>
          </div>

          {/* Присоединиться */}
          <div className="panel panel-side">
            <div className="panel-header">
              <h3>У меня есть приглашение</h3>
              <p className="panel-helper">
                Введите ID встречи, который вам отправили, и подключайтесь.
              </p>
            </div>

            <div className="panel-fields">
              <label className="field-label" htmlFor="meeting-code">
                ID встречи
              </label>
              <input
                id="meeting-code"
                type="text"
                placeholder="Например, 123e4567-e89b-12d3-a456-426614174000"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
              />
            </div>

            <button className="btn ghost" onClick={handleJoinMeeting}>
              Присоединиться
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Home;
