import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import VideoCall from '../VideoCall/VideoCall';
import JoinMeeting from './JoinMeeting/JoinMeeting';
import Chat from '../Chat/Chat';
import './Meeting.css';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import { fetchMeeting, joinMeeting } from '../../services/api';

function Meeting() {
  const { meetingId } = useParams();
  const location = useLocation();
  const [userName, setUserName] = useState(location.state?.name || '');
  const autoJoin = Boolean(location.state?.autoJoin);
  const [joined, setJoined] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [participants, setParticipants] = useState([]); // список участников (кроме текущего пользователя)
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState('');
  const [meetingUnavailable, setMeetingUnavailable] = useState(false);
  const [joining, setJoining] = useState(false);
  const autoJoinAttemptedRef = useRef(false);
  const [connectionNonce, setConnectionNonce] = useState(0);

  useEffect(() => {
    // Загрузка информации о встрече (название и проверка доступности)
    const loadMeeting = async () => {
      try {
        const data = await fetchMeeting(meetingId);
        setMeetingTitle(data.title || 'Новая встреча');
        setMeetingUnavailable(false);
        setError('');
      } catch (err) {
        console.warn('Failed to fetch meeting data, using default value', err);
        setMeetingTitle('Встреча недоступна');
        setMeetingUnavailable(true);
        setError('Встреча не найдена или её срок истёк. Проверьте ссылку и попробуйте снова.');
      } finally {
        setLoadingInfo(false);
      }
    };
    loadMeeting();
  }, [meetingId]);

  // Обработчик нажатия "Войти в встречу"
  const handleJoin = useCallback((name, initialAudioOn = true, initialVideoOn = true) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Введите имя, чтобы коллеги знали, кто присоединился');
      return;
    }
    if (meetingUnavailable) {
      setError('Встреча не найдена, подключение невозможно.');
      return;
    }
    setJoining(true);
    joinMeeting(meetingId, trimmedName)
      .then(() => {
        setError('');
        setUserName(trimmedName);
        // Сохраняем начальные состояния устройств (микрофон/камера)
        setLocalAudioEnabled(initialAudioOn);
        setLocalVideoEnabled(initialVideoOn);
        setJoined(true);
      })
      .catch((err) => {
        console.warn('Failed to join meeting', err);
        setError('Подключение отклонено: встреча не найдена или недоступна.');
      })
      .finally(() => setJoining(false));
  }, [meetingId, meetingUnavailable]);

  useEffect(() => {
    // Автоподключение к новой встрече, если указано и имя уже введено
    if (
      !autoJoinAttemptedRef.current &&
      autoJoin &&
      !loadingInfo &&
      !joined &&
      !meetingUnavailable &&
      userName?.trim()
    ) {
      autoJoinAttemptedRef.current = true;
      handleJoin(userName.trim(), true, true);
    }
  }, [autoJoin, joined, loadingInfo, meetingUnavailable, userName, handleJoin]);

  const handleParticipantsChange = (list) => {
    setParticipants(list || []);
  };

  const handleLeave = () => {
    setJoined(false);
    setParticipants([]);
    setLocalAudioEnabled(true);
    setLocalVideoEnabled(true);
    setConnectionNonce((prev) => prev + 1);
  };

  // Контент до входа во встречу (без WebSocket)
  const preJoinContent = (
    <div className="meeting-shell">
      <header className="meeting-header">
        <div>
          <p className="eyebrow">ID встречи</p>
          <h2>{meetingId}</h2>
          <p className="muted">{meetingTitle || 'Онлайн-созвон через cord'}</p>
        </div>
        <div className="pill">0 участников</div>
      </header>

      {meetingUnavailable ? (
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
      )}
    </div>
  );

  // Контент после входа во встречу (с WebSocket)
  const meetingContent = (
    <WebSocketProvider key={`${meetingId}-${connectionNonce}`} meetingId={meetingId}>
      <div className="meeting-shell">
        <header className="meeting-header">
          <div>
            <p className="eyebrow">ID встречи</p>
            <h2>{meetingId}</h2>
            <p className="muted">{meetingTitle || 'Онлайн-созвон через cord'}</p>
          </div>
          <div className="pill">{participants.length + 1} участников</div>
        </header>

        <div className="meeting-layout">
          <section className="stage">
            <VideoCall
              userName={userName}
              initialAudioEnabled={localAudioEnabled}
              initialVideoEnabled={localVideoEnabled}
              onParticipantsChange={handleParticipantsChange}
              onLeave={handleLeave}
              onLocalMediaChange={(audioOn, videoOn) => {
                setLocalAudioEnabled(audioOn);
                setLocalVideoEnabled(videoOn);
              }}
            />
          </section>
          <aside className="side-panel">
            <div className="panel-block participants">
              <div className="panel-title">Участники</div>
              <p className="muted small">
                Участники появляются сразу после сигнала, даже если видео ещё подключается.
              </p>
              <ul>
                <li key="self">
                  <span className="presence-dot" />
                  {userName || 'Вы'}
                  <span className={`badge ${localAudioEnabled ? '' : 'muted'}`}>
                    <i className={`fas ${localAudioEnabled ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                  </span>
                  <span className={`badge ${localVideoEnabled ? '' : 'muted'}`}>
                    <i className={`fas ${localVideoEnabled ? 'fa-video' : 'fa-video-slash'}`} />
                  </span>
                </li>
                {participants.map((p) => (
                  <li key={p.id}>
                    <span className="presence-dot" />
                    {p.name || 'Участник'}
                    <span className={`badge ${p.audioEnabled ? '' : 'muted'}`}>
                      <i className={`fas ${p.audioEnabled ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                    </span>
                    <span className={`badge ${p.videoEnabled ? '' : 'muted'}`}>
                      <i className={`fas ${p.videoEnabled ? 'fa-video' : 'fa-video-slash'}`} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel-block chat-block">
              <Chat userName={userName} meetingId={meetingId} />
            </div>
          </aside>
        </div>
      </div>
    </WebSocketProvider>
  );

  return joined ? meetingContent : preJoinContent;
}

export default Meeting;
