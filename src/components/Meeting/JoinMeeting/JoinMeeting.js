import React, { useState, useEffect, useRef } from 'react';
import './JoinMeeting.css';

/**
 * Проверяет, доступен ли API mediaDevices (требует HTTPS или localhost)
 */
function isMediaDevicesSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function JoinMeeting({ defaultName = '', onJoin, loading, error, disabled = false }) {
  const [userName, setUserName] = useState(defaultName);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [mediaRequested, setMediaRequested] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaSupported, setMediaSupported] = useState(true);
  const videoRef = useRef(null);
  const localStreamRef = useRef(null);

  // Проверяем поддержку mediaDevices при монтировании
  useEffect(() => {
    if (!isMediaDevicesSupported()) {
      console.warn('mediaDevices API unavailable. HTTPS or localhost required.');
      setMediaSupported(false);
      setMediaError(
        'Камера и микрофон недоступны. Для работы с медиа требуется HTTPS-соединение или localhost.'
      );
    }
  }, []);

  // Запрашиваем медиа только при первом взаимодействии с кнопками или при нажатии Войти
  const requestMedia = async () => {
    if (localStreamRef.current) {
      return;
    }

    if (mediaRequested) {
      return; // Уже запрашиваем, не делаем повторный запрос
    }

    // Если mediaDevices не поддерживается, не пытаемся запросить
    if (!isMediaDevicesSupported()) {
      setMediaSupported(false);
      setMediaError(
        'Камера и микрофон недоступны. Для работы с медиа требуется HTTPS-соединение или localhost.'
      );
      return;
    }

    setMediaRequested(true);
    try {
      // Всегда запрашиваем оба потока, чтобы можно было переключать их позже
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      localStreamRef.current = stream;
      
      // Применяем начальные настройки на основе текущего состояния
      stream.getAudioTracks().forEach((track) => {
        track.enabled = isAudioOn;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOn;
      });
      
      // Отображаем превью видео в элементе <video>
      if (videoRef.current) {
        if (isVideoOn) {
          videoRef.current.srcObject = stream;
        } else {
          videoRef.current.srcObject = null;
        }
      }
      setMediaError('');
    } catch (err) {
      console.error('Error obtaining media for preview:', err);
      if (err.name === 'NotAllowedError') {
        setMediaError('Доступ к камере/микрофону запрещён. Разрешите доступ в настройках браузера.');
      } else if (err.name === 'NotFoundError') {
        setMediaError('Камера или микрофон не найдены на устройстве.');
      } else {
        setMediaError('Не удалось получить доступ к камере/микрофону.');
      }
      setMediaRequested(false);
    }
  };

  // Очистка: останавливаем поток при уходе со страницы
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  // Переключение микрофона в превью
  const toggleAudio = async () => {
    // Если медиа еще не запрошены, запрашиваем их
    if (!localStreamRef.current) {
      await requestMedia();
      // Если после запроса все еще нет потока, просто меняем состояние
      if (!localStreamRef.current) {
        setIsAudioOn((prev) => !prev);
        return;
      }
    }
    
    const nextAudioOn = !isAudioOn;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = nextAudioOn;
      });
    }
    setIsAudioOn(nextAudioOn);
  };

  // Переключение камеры в превью
  const toggleVideo = async () => {
    // Если медиа еще не запрошены, запрашиваем их
    if (!localStreamRef.current) {
      await requestMedia();
      // Если после запроса все еще нет потока, просто меняем состояние
      if (!localStreamRef.current) {
        setIsVideoOn((prev) => !prev);
        return;
      }
    }
    
    const nextVideoOn = !isVideoOn;
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextVideoOn;
      });
      
      // Обновляем видео элемент
      if (videoRef.current) {
        if (nextVideoOn && localStreamRef.current) {
          videoRef.current.srcObject = localStreamRef.current;
        } else {
          videoRef.current.srcObject = null;
        }
      }
    }
    setIsVideoOn(nextVideoOn);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Запрашиваем медиа перед входом, если еще не запрошены
    if (!localStreamRef.current) {
      await requestMedia();
    }
    
    // Останавливаем локальный поток перед входом (он будет создан заново в VideoCall)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    
    // При нажатии "Войти" вызываем onJoin, передавая имя и начальные состояния аудио/видео
    onJoin(userName || 'Гость', isAudioOn, isVideoOn);
  };

  return (
    <div className="join-card">
      <div className="preview">
        {/* Видео элемент всегда в DOM для возможности обновления */}
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          style={{ display: isVideoOn && localStreamRef.current ? 'block' : 'none' }}
        />
        {/* Плейсхолдер с аватаром, когда видео выключено или поток не загружен */}
        {(!isVideoOn || !localStreamRef.current) && (
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
        {mediaError && (
          <div className="media-warning">
            <i className="fas fa-exclamation-triangle" /> {mediaError}
          </div>
        )}
        <button type="submit" className="primary" disabled={loading || disabled}>
          {loading ? 'Проверяем встречу…' : disabled ? 'Встреча недоступна' : 'Войти в встречу'}
        </button>
      </form>
    </div>
  );
}

export default JoinMeeting;
