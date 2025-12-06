import React, { createContext, useEffect, useState } from 'react';

export const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children, meetingId }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!meetingId) return undefined;

    const connection = new WebSocket(`ws://localhost:8080/webrtc-signal?meetingId=${meetingId}`);
    setSocket(connection);

    connection.onopen = () => {
      console.log('Соединение с сервером установлено');
    };

    connection.onerror = (error) => {
      console.error('Ошибка WebSocket:', error);
    };

    connection.onclose = () => {
      console.log('Соединение с сервером закрыто');
    };

    return () => {
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
