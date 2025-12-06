import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Chat from '../Chat/Chat';
import VideoCall from '../VideoCall/VideoCall';
import JoinMeeting from './JoinMeeting/JoinMeeting';
import './Meeting.css';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import { fetchMeeting, fetchParticipants, joinMeeting } from '../../services/api';

function Meeting() {
  const { meetingId } = useParams();
  const location = useLocation();
  const [userName, setUserName] = useState(location.state?.name || '');
  const autoJoin = Boolean(location.state?.autoJoin);
  const [joined, setJoined] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [participants, setParticipants] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState('');
  const [meetingUnavailable, setMeetingUnavailable] = useState(false);
  const [joining, setJoining] = useState(false);
  const autoJoinAttempted = useRef(false);

  const mergeParticipants = (prev, nextList) => {
    const safeNext = nextList || [];
    const combined = [...prev, ...safeNext].filter(Boolean);
    const uniqueIds = new Map();
    combined.forEach((p) => {
      if (p?.name) {
        uniqueIds.set(p.name, p);
      }
    });
    return Array.from(uniqueIds.values());
  };

  useEffect(() => {
    const loadMeeting = async () => {
      try {
        const data = await fetchMeeting(meetingId);
        setMeetingTitle(data.title || 'Новая встреча');
        setMeetingUnavailable(false);
        setError('');
      } catch (err) {
        console.warn('Не удалось получить данные встречи, используем дефолтное значение', err);
        setMeetingTitle('Встреча недоступна');
        setMeetingUnavailable(true);
        setError('Встреча не найдена или её срок истёк. Проверьте ссылку и попробуйте снова.');
      } finally {
        setLoadingInfo(false);
      }
    };
    loadMeeting();
  }, [meetingId]);

  useEffect(() => {
    if (
      !autoJoinAttempted.current &&
      autoJoin &&
      !loadingInfo &&
      !joined &&
      !meetingUnavailable &&
      userName?.trim()
    ) {
      autoJoinAttempted.current = true;
      handleJoin(userName.trim());
    }
  }, [autoJoin, joined, loadingInfo, meetingUnavailable, userName]);

  useEffect(() => {
    const loadParticipants = async () => {
      try {
        const data = await fetchParticipants(meetingId);
        setParticipants((prev) => mergeParticipants(prev, data));
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

    if (meetingUnavailable) {
      setError('Встреча не найдена, подключение невозможно.');
      return;
    }

    setJoining(true);
    joinMeeting(meetingId, name.trim())
      .then(() => {
        setError('');
        setUserName(name.trim());
        setJoined(true);
      })
      .catch((err) => {
        console.warn('Не удалось присоединиться к встрече', err);
        setError('Подключение отклонено: встреча не найдена или недоступна.');
      })
      .finally(() => setJoining(false));
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
          meetingUnavailable ? (
            <div className="join-card">
              <div className="join-form">
                <p className="eyebrow">Встреча недоступна</p>
                <h3>Не удалось открыть встречу</h3>
                <p className="muted">{error || 'Проверьте ссылку и попробуйте снова.'}</p>
              </div>
            </div>
          ) : (
            <JoinMeeting
              defaultName={userName}
              onJoin={handleJoin}
              loading={loadingInfo || joining}
              error={error}
              disabled={meetingUnavailable}
            />
          )
        ) : (
          <div className="meeting-layout">
            <section className="stage">
              <VideoCall
                userName={userName}
                onParticipantsChange={(list) => setParticipants((prev) => mergeParticipants(prev, list))}
              />
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
