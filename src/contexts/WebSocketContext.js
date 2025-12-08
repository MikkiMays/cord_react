import React, { createContext, useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!meetingId) {
      console.log('WebSocketProvider: meetingId not set, skipping connection');
      return undefined;
    }

    const url = `${WS_BASE}/webrtc-signal?meetingId=${encodeURIComponent(meetingId)}`;
    console.log('WebSocket: Connecting to', url);
    
    let connection;
    try {
      connection = new WebSocket(url);
    } catch (error) {
      console.error('WebSocket: Error creating connection:', error);
      return undefined;
    }

    // Отслеживаем состояние подключения
    let wasOpened = false;

    connection.onopen = () => {
      wasOpened = true;
      console.log('WebSocket: Connection established successfully');
    };

    connection.onerror = (event) => {
      console.error('WebSocket: Connection error', event);
      if (!wasOpened) {
        console.error('WebSocket: Failed to establish connection. Check:');
        console.error('  1. Is the backend running on the server?');
        console.error('  2. Is the WebSocket port open?');
        console.error('  3. If using nginx - is WebSocket proxying configured?');
      }
    };

    connection.onclose = (event) => {
      const reason = getCloseReason(event.code, event.reason);
      console.log(`WebSocket: Connection closed [code ${event.code}]: ${reason}`);
      
      if (!wasOpened) {
        console.warn('WebSocket: Connection closed before establishing!');
        console.warn('Possible reasons:');
        console.warn('  - Backend is not running or unavailable');
        console.warn('  - meetingId does not exist (code 4404)');
        console.warn('  - Firewall is blocking WebSocket');
        console.warn('  - nginx is not proxying WebSocket correctly');
      }
      
      setSocket(null);
    };

    connection.onmessage = (event) => {
      // Логируем первое сообщение для отладки
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'your-id') {
          console.log('WebSocket: Received session ID:', data.sessionId);
        }
      } catch (e) {
        // игнорируем ошибки парсинга
      }
    };

    setSocket(connection);

    return () => {
      console.log('WebSocket: Closing connection (cleanup)');
      connection.close();
      setSocket(null);
    };
  }, [meetingId]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};
