import React, { useState, useEffect, useRef } from 'react';
import './JoinMeeting.css';

function JoinMeeting({ defaultName = '', onJoin, loading, error, disabled = false }) {
  const [userName, setUserName] = useState(defaultName);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const videoRef = useRef(null);
  const localStreamRef = useRef(null);

  // Запрашиваем разрешения и получаем локальный поток для превью при монтировании
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        // Отображаем превью видео в элементе <video>
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Ошибка получения медиа для превью:', err);
        alert('Необходимо предоставить доступ к камере и микрофону для участия в видеовстрече.');
      });
    // Очистка: останавливаем поток при уходе со страницы
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Переключение микрофона в превью
  const toggleAudio = () => {
    if (!localStreamRef.current) {
      setIsAudioOn((prev) => !prev);
      return;
    }
    const nextAudioOn = !isAudioOn;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = nextAudioOn;
    });
    setIsAudioOn(nextAudioOn);
  };

  // Переключение камеры в превью
  const toggleVideo = () => {
    if (!localStreamRef.current) {
      setIsVideoOn((prev) => !prev);
      return;
    }
    const nextVideoOn = !isVideoOn;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = nextVideoOn;
    });
    setIsVideoOn(nextVideoOn);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // При нажатии "Войти" вызываем onJoin, передавая имя и начальные состояния аудио/видео
    onJoin(userName || 'Гость', isAudioOn, isVideoOn);
  };

  return (
    <div className="join-card">
      <div className="preview">
        {/* Если видео включено и есть поток, отображаем его; иначе – аватар */}
        {isVideoOn && localStreamRef.current ? (
          <video ref={videoRef} autoPlay muted />
        ) : (
          <div className="placeholder-video">
            <div className="avatar">{(userName || 'Гость').charAt(0).toUpperCase()}</div>
          </div>
        )}
        {/* Кнопки управления устройствами на предэкране */}
        <div className="controls">
          <button type="button" onClick={toggleAudio} title={isAudioOn ? 'Выключить микрофон' : 'Включить микрофон'}>
            <i className={`fas ${isAudioOn ? 'fa-microphone' : 'fa-microphone-slash'}`} />
          </button>
          <button type="button" onClick={toggleVideo} title={isVideoOn ? 'Выключить камеру' : 'Включить камеру'}>
            <i className={`fas ${isVideoOn ? 'fa-video' : 'fa-video-slash'}`} />
          </button>
        </div>
      </div>
      <form className="join-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Подключение</p>
        <h3>Представьтесь перед входом</h3>
        <p className="muted">
          Введите имя, чтобы участники встречи знали, кто подключился.
        </p>
        <label className="field-label" htmlFor="user-name">Имя</label>
        <input
          id="user-name"
          type="text"
          placeholder="Ваше имя"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        {error && <div className="error-hint">{error}</div>}
        <button type="submit" className="primary" disabled={loading || disabled}>
          {loading ? 'Проверяем встречу…' : disabled ? 'Встреча недоступна' : 'Войти в встречу'}
        </button>
      </form>
    </div>
  );
}

export default JoinMeeting;
