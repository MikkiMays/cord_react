import React, { createContext, useEffect, useRef } from 'react';

export const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children, meetingId }) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!meetingId) return; // Ждём, пока meetingId будет доступен

    const socket = new WebSocket(`ws://localhost:8080/webrtc-signal?meetingId=${meetingId}`);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Соединение с сервером установлено');
    };

    socket.onerror = (error) => {
      console.error('Ошибка WebSocket:', error);
    };

    socket.onclose = () => {
      console.log('Соединение с сервером закрыто');
    };

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [meetingId]); // Добавляем meetingId в зависимости

  return (
    <WebSocketContext.Provider value={socketRef.current}>
      {children}
    </WebSocketContext.Provider>
  );
};
