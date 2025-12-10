import React, { createContext, useEffect, useState, useRef, useCallback } from 'react';

export const WebSocketContext = createContext(null);

// Автоматически определяем WebSocket URL на основе текущего хоста
const WS_BASE =
  process.env.REACT_APP_WS_BASE ||
  (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
    window.location.host;

/**
 * Расшифровка кодов закрытия WebSocket
 */
function getCloseReason(code, reason) {
  const codes = {
    1000: 'Нормальное закрытие',
    1001: 'Сервер уходит / страница закрывается',
    1002: 'Ошибка протокола',
    1003: 'Неподдерживаемые данные',
    1005: 'Нет кода статуса',
    1006: 'Соединение потеряно (сервер недоступен или закрыл соединение)',
    1007: 'Некорректные данные',
    1008: 'Нарушение политики',
    1009: 'Сообщение слишком большое',
    1010: 'Требуется расширение',
    1011: 'Внутренняя ошибка сервера',
    1015: 'Ошибка TLS',
    4404: 'Встреча не найдена (сервер)',
  };
  return codes[code] || reason || `Неизвестный код: ${code}`;
}

export const WebSocketProvider = ({ children, meetingId }) => {
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const connectionRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const intentionalCloseRef = useRef(false);

  /**
   * Создание WebSocket соединения
   */
  const connect = useCallback(() => {
    if (!meetingId) {
      console.log('WebSocketProvider: meetingId не задан, пропускаем подключение');
      return null;
    }

    // Очищаем предыдущее соединение если есть
    if (connectionRef.current) {
      console.log('WebSocketProvider: Закрываем предыдущее соединение');
      intentionalCloseRef.current = true;
      connectionRef.current.close();
      connectionRef.current = null;
    }

    const url = `${WS_BASE}/webrtc-signal?meetingId=${encodeURIComponent(meetingId)}`;
    console.log('WebSocket: Подключение к', url);
    
    let connection;
    try {
      connection = new WebSocket(url);
    } catch (error) {
      console.error('WebSocket: Ошибка создания соединения:', error);
      setConnectionState('error');
      return null;
    }

    connectionRef.current = connection;
    setConnectionState('connecting');
    intentionalCloseRef.current = false;

    // Отслеживаем состояние подключения
    let wasOpened = false;

    connection.onopen = () => {
      if (!mountedRef.current) {
        connection.close();
        return;
      }
      wasOpened = true;
      setConnectionState('connected');
      console.log('WebSocket: Соединение установлено успешно');
      setSocket(connection);
    };

    connection.onerror = (event) => {
      console.error('WebSocket: Ошибка соединения', event);
      if (!wasOpened) {
        console.error('WebSocket: Соединение не удалось установить. Проверьте:');
        console.error('  1. Работает ли бэкенд на сервере?');
        console.error('  2. Открыт ли порт для WebSocket?');
        console.error('  3. Если используется nginx - настроено ли проксирование WebSocket?');
        setConnectionState('error');
      }
    };

    connection.onclose = (event) => {
      const reason = getCloseReason(event.code, event.reason);
      console.log(`WebSocket: Соединение закрыто [код ${event.code}]: ${reason}`);
      
      if (!wasOpened) {
        console.warn('WebSocket: Соединение закрылось до установления связи!');
        console.warn('Возможные причины:');
        console.warn('  - Бэкенд не запущен или недоступен');
        console.warn('  - meetingId не существует (код 4404)');
        console.warn('  - Firewall блокирует WebSocket');
        console.warn('  - nginx не проксирует WebSocket правильно');
      }
      
      // Очищаем refs
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
      
      setSocket(null);
      setConnectionState('disconnected');

      // Автоматическое переподключение при неожиданном разрыве
      // Не переподключаемся если:
      // - Компонент размонтирован
      // - Это было намеренное закрытие
      // - Код 4404 (встреча не найдена)
      // - Код 1000 (нормальное закрытие)
      if (
        mountedRef.current && 
        !intentionalCloseRef.current && 
        event.code !== 4404 && 
        event.code !== 1000 &&
        wasOpened
      ) {
        console.log('WebSocket: Планируем переподключение через 3 секунды...');
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            console.log('WebSocket: Переподключение...');
            connect();
          }
        }, 3000);
      }
    };

    connection.onmessage = (event) => {
      // Логируем первое сообщение для отладки
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'your-id') {
          console.log('WebSocket: Получен ID сессии:', data.sessionId);
        }
      } catch (e) {
        // игнорируем ошибки парсинга
      }
    };

    return connection;
  }, [meetingId]);

  /**
   * Инициализация соединения при монтировании
   */
  useEffect(() => {
    mountedRef.current = true;
    intentionalCloseRef.current = false;
    
    connect();

    return () => {
      console.log('WebSocketProvider: Размонтирование, закрываем соединение');
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      
      // Отменяем pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Закрываем соединение
      if (connectionRef.current) {
        connectionRef.current.close(1000, 'Component unmounted');
        connectionRef.current = null;
      }
      
      setSocket(null);
      setConnectionState('disconnected');
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};
