import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Chat from '../Chat/Chat';
import VideoCall from '../VideoCall/VideoCall';
import JoinMeeting from './JoinMeeting/JoinMeeting';
import './Meeting.css';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import { fetchMeeting, fetchParticipants } from '../../services/api';

function Meeting() {
  const { meetingId } = useParams();
  const location = useLocation();
  const [userName, setUserName] = useState(location.state?.name || '');
  const [joined, setJoined] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [participants, setParticipants] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadMeeting = async () => {
      try {
        const data = await fetchMeeting(meetingId);
        setMeetingTitle(data.title || 'Новая встреча');
      } catch (err) {
        console.warn('Не удалось получить данные встречи, используем дефолтное значение', err);
        setMeetingTitle('Новая встреча');
      } finally {
        setLoadingInfo(false);
      }
    };
    loadMeeting();
  }, [meetingId]);

  useEffect(() => {
    const loadParticipants = async () => {
      try {
        const data = await fetchParticipants(meetingId);
        setParticipants(data);
      } catch (err) {
        console.warn('Не удалось загрузить участников', err);
      }
    };

    if (joined) {
      loadParticipants();
    }
  }, [joined, meetingId]);

  const handleJoin = (name) => {
    if (!name.trim()) {
      setError('Введите имя, чтобы коллеги знали, кто присоединился');
      return;
    }
    setError('');
    setUserName(name.trim());
    setJoined(true);
  };

  const combinedParticipants = useMemo(() => {
    const others = participants?.map((p) => p.name).filter(Boolean) || [];
    const unique = Array.from(new Set([userName || 'Вы', ...others]));
    return unique;
  }, [participants, userName]);

  return (
    <WebSocketProvider meetingId={meetingId}>
      <div className="meeting-shell">
        <header className="meeting-header">
          <div>
            <p className="eyebrow">ID встречи</p>
            <h2>{meetingId}</h2>
            <p className="muted">{meetingTitle || 'Онлайн-созвон через cord'}</p>
          </div>
          <div className="pill">{combinedParticipants.length} участников</div>
        </header>

        {!joined ? (
          <JoinMeeting
            defaultName={userName}
            onJoin={handleJoin}
            loading={loadingInfo}
            error={error}
          />
        ) : (
          <div className="meeting-layout">
            <section className="stage">
              <VideoCall userName={userName} onParticipantsChange={setParticipants} />
            </section>
            <aside className="side-panel">
              <div className="panel-block">
                <div className="panel-title">Чат</div>
                <Chat userName={userName} meetingId={meetingId} />
              </div>
              <div className="panel-block participants">
                <div className="panel-title">Участники</div>
                <ul>
                  {combinedParticipants.map((name) => (
                    <li key={name}>
                      <span className="presence-dot" />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </WebSocketProvider>
  );
}

export default Meeting;
