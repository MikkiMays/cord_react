import React, { useState, useEffect, useRef } from 'react';
import './JoinMeeting.css';
import { VIDEO_PROFILES } from './mediaProfiles';

/**
 * Проверяет, доступен ли API mediaDevices (требует HTTPS или localhost)
 */
function isMediaDevicesSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function JoinMeeting({ defaultName = '', onJoin, loading, error, disabled = false }) {
  const [userName, setUserName] = useState(defaultName);
  // По умолчанию микрофон и камера ВЫКЛЮЧЕНЫ
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaSupported, setMediaSupported] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const videoRef = useRef(null);
  const localStreamRef = useRef(null);
  const facingModeRef = useRef('user'); // 'user' (фронтальная) или 'environment' (задняя)

  /**
   * Запрашиваем разрешение на медиа СРАЗУ при загрузке компонента
   */
  useEffect(() => {
    // Проверяем поддержку mediaDevices
    if (!isMediaDevicesSupported()) {
      console.warn('mediaDevices API недоступен. Требуется HTTPS или localhost.');
      setMediaSupported(false);
      setMediaError(
        'Камера и микрофон недоступны. Для работы с медиа требуется HTTPS-соединение или localhost.'
      );
      return;
    }

    // Запрашиваем разрешения сразу при монтировании
    const requestMediaPermissions = async () => {
      try {
        console.log('Запрашиваем разрешение на камеру и микрофон...');

        // Сначала пытаемся получить оба устройства
        let stream;
        let audioAvailable = false;
        let videoAvailable = false;
        const errors = [];

        try {
          // stream = await navigator.mediaDevices.getUserMedia({ 
          //   video: true, 
          //   audio: true 
          // });

          // Пытаемся получить оба устройства
           // ВРЕМЕННО: получаем устройства с 1080p 60fps профилем для тестирования
           stream = await navigator.mediaDevices.getUserMedia({
             audio: {
               echoCancellation: true,
               noiseSuppression: true,
               autoGainControl: true,
             },
             video: {
               ...VIDEO_PROFILES.fullhd.constraints,
               facingMode: facingModeRef.current,
             },
           });


          audioAvailable = stream.getAudioTracks().length > 0;
          videoAvailable = stream.getVideoTracks().length > 0;
          console.log('Оба устройства получены:', { audio: audioAvailable, video: videoAvailable });
        } catch (err) {
          // Если не удалось получить оба, пробуем по отдельности
          console.log('Не удалось получить оба устройства, пробуем по отдельности...', err.name);

          const tracks = [];

          // Пробуем получить аудио
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tracks.push(...audioStream.getAudioTracks());
            audioAvailable = true;
            console.log('Аудио получено');
            // Останавливаем временный поток, треки уже сохранены
            audioStream.getVideoTracks().forEach(t => t.stop());
          } catch (audioErr) {
            console.warn('Не удалось получить аудио:', audioErr.name);
            if (audioErr.name === 'NotAllowedError') {
              errors.push('Доступ к микрофону запрещён');
            } else if (audioErr.name === 'NotFoundError') {
              errors.push('Микрофон не найден');
            } else {
              errors.push('Не удалось получить доступ к микрофону');
            }
          }

          // Пробуем получить видео
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ 
              video: {
                facingMode: facingModeRef.current,
              }
            });
            tracks.push(...videoStream.getVideoTracks());
            videoAvailable = true;
            console.log('Видео получено');
            // Останавливаем временный поток, треки уже сохранены
            videoStream.getAudioTracks().forEach(t => t.stop());
          } catch (videoErr) {
            console.warn('Не удалось получить видео:', videoErr.name);
            if (videoErr.name === 'NotAllowedError') {
              errors.push('Доступ к камере запрещён');
            } else if (videoErr.name === 'NotFoundError') {
              errors.push('Камера не найдена');
            } else {
              errors.push('Не удалось получить доступ к камере');
            }
          }

          // Создаем новый поток из полученных треков
          if (tracks.length > 0) {
            stream = new MediaStream(tracks);
            console.log('Создан поток из отдельных треков:', tracks.length);
          } else {
            throw new Error('Не удалось получить ни одно устройство');
          }
        }

        if (!stream || stream.getTracks().length === 0) {
          throw new Error('Не удалось получить доступ к медиа-устройствам');
        }

        localStreamRef.current = stream;
        setPermissionGranted(true);
        setVideoAvailable(videoAvailable);
        setAudioAvailable(audioAvailable);

        // Формируем сообщение об ошибке/предупреждении
        // Используем errors, если они были собраны, иначе формируем на основе доступности
        let errorMessage = '';
        if (audioAvailable && videoAvailable) {
          errorMessage = '';
        } else if (!audioAvailable && !videoAvailable) {
          // Если есть детальные ошибки, используем их
          if (errors && errors.length > 0) {
            errorMessage = errors.join('. ') + '.';
          } else {
            errorMessage = 'Не удалось получить доступ к камере и микрофону.';
          }
        } else if (!audioAvailable) {
          errorMessage = 'Микрофон недоступен. Вы сможете участвовать только с видео.';
        } else if (!videoAvailable) {
          errorMessage = 'Камера недоступна. Вы сможете участвовать только с аудио.';
        }
        setMediaError(errorMessage);

        // По умолчанию всё ВЫКЛЮЧЕНО - отключаем треки
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });

        // Видео не показываем пока камера выключена
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        console.log('Разрешения получены, треки по умолчанию выключены');
      } catch (err) {
        console.error('Ошибка получения доступа к медиа:', err);
        setPermissionGranted(false);
        setVideoAvailable(false);
        setAudioAvailable(false);
        if (err.name === 'NotAllowedError' || err.message?.includes('запрещён')) {
          if (!mediaError) {
            setMediaError('Доступ к камере/микрофону запрещён. Разрешите доступ в настройках браузера.');
          }
        } else if (err.name === 'NotFoundError' || err.message?.includes('не найден')) {
          if (!mediaError) {
            setMediaError('Камера или микрофон не найдены на устройстве.');
          }
        } else {
          if (!mediaError) {
            setMediaError('Не удалось получить доступ к камере/микрофону.');
          }
        }
      }
    };

    requestMediaPermissions();

    // Cleanup: останавливаем поток при уходе со страницы
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  /**
   * Переключение микрофона в превью
   */
  const toggleAudio = () => {
    if (!localStreamRef.current) {
      console.warn('toggleAudio: поток не инициализирован');
      return;
    }

    const newState = !isAudioOn;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = newState;
    });
    setIsAudioOn(newState);
    console.log('Микрофон:', newState ? 'включён' : 'выключен');
  };

  /**
   * Переключение камеры в превью
   */
  const toggleVideo = () => {
    if (!localStreamRef.current) {
      console.warn('toggleVideo: поток не инициализирован');
      return;
    }

    const newState = !isVideoOn;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = newState;
    });

    // Обновляем видео элемент
    if (videoRef.current) {
      if (newState) {
        videoRef.current.srcObject = localStreamRef.current;
        // Применяем зеркальное отображение для превью
        videoRef.current.style.transform = 'scaleX(-1)';
      } else {
        videoRef.current.srcObject = null;
      }
    }

    setIsVideoOn(newState);
    console.log('Камера:', newState ? 'включена' : 'выключена');
  };

  /**
   * Переключение между фронтальной и задней камерой
   */
  const switchCamera = async () => {
    if (!localStreamRef.current) {
      console.warn('switchCamera: поток не инициализирован');
      return;
    }

    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn('switchCamera: нет видео треков');
      return;
    }

    try {
      // Переключаем facingMode
      const currentFacingMode = facingModeRef.current;
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      facingModeRef.current = newFacingMode;

      console.log(`Переключение камеры в превью: ${currentFacingMode} -> ${newFacingMode}`);

      const wasEnabled = videoTracks[0].enabled;

      // Останавливаем старый трек
      videoTracks.forEach((track) => {
        track.stop();
      });

      // Получаем новый поток с другой камерой
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...VIDEO_PROFILES.fullhd.constraints,
          facingMode: newFacingMode,
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      
      // Заменяем трек в локальном потоке
      localStreamRef.current.removeTrack(videoTracks[0]);
      localStreamRef.current.addTrack(newVideoTrack);
      
      // Останавливаем временный поток
      newStream.getAudioTracks().forEach((t) => t.stop());

      // Применяем предыдущее состояние
      newVideoTrack.enabled = wasEnabled;

      // Обновляем видео элемент
      if (videoRef.current && wasEnabled) {
        videoRef.current.srcObject = localStreamRef.current;
        videoRef.current.style.transform = 'scaleX(-1)';
      }

      console.log(`Камера переключена на: ${newFacingMode}`);
    } catch (error) {
      console.error('Ошибка переключения камеры:', error);
      // Возвращаемся к предыдущему состоянию при ошибке
      facingModeRef.current = facingModeRef.current === 'user' ? 'environment' : 'user';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Останавливаем локальный поток перед входом (он будет создан заново в VideoCall)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    // При нажатии "Войти" вызываем onJoin, передавая имя и текущие состояния аудио/видео
    onJoin(userName || 'Гость', isAudioOn, isVideoOn);
  };

  // Определяем, можно ли нажимать кнопки управления
  const canToggleMedia = permissionGranted && localStreamRef.current;
  const canToggleVideo = canToggleMedia && videoAvailable;
  const canToggleAudio = canToggleMedia && audioAvailable;

  return (
    <div className="join-card">
      <div className="preview">
        {/* Видео элемент для превью */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="preview-video-mirror"
          style={{ 
            display: isVideoOn && permissionGranted ? 'block' : 'none',
            transform: 'scaleX(-1)'
          }}
        />
        {/* Плейсхолдер с аватаром, когда видео выключено */}
        {(!isVideoOn || !permissionGranted) && (
          <div className="placeholder-video">
            <div className="avatar">{(userName || 'Гость').charAt(0).toUpperCase()}</div>
          </div>
        )}
        {/* Кнопки управления устройствами на предэкране */}
        <div className="controls">
          <button
            type="button"
            onClick={toggleAudio}
            disabled={!canToggleAudio}
            className={!isAudioOn ? 'muted' : ''}
            title={isAudioOn ? 'Выключить микрофон' : 'Включить микрофон'}
          >
            <i className={`fas ${isAudioOn ? 'fa-microphone' : 'fa-microphone-slash'}`} />
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            disabled={!canToggleVideo}
            className={!isVideoOn ? 'muted' : ''}
            title={isVideoOn ? 'Выключить камеру' : 'Включить камеру'}
          >
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
        {!permissionGranted && !mediaError && mediaSupported && (
          <div className="media-info">
            <i className="fas fa-info-circle" /> Ожидание разрешения на использование камеры и микрофона...
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
