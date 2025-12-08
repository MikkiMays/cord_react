import React, { createContext, useEffect, useState } from 'react';

export const WebSocketContext = createContext(null);

// Автоматически определяем WebSocket URL на основе текущего хоста
const WS_BASE =
  process.env.REACT_APP_WS_BASE ||
  (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
    window.location.host;

export const WebSocketProvider = ({ children, meetingId }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!meetingId) return undefined;

    const url = `${WS_BASE}/webrtc-signal?meetingId=${encodeURIComponent(meetingId)}`;
    console.log('Connecting to WebSocket:', url);
    const connection = new WebSocket(url);
    setSocket(connection);

    connection.onopen = () => {
      console.log('Server connection established');
    };

    connection.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    connection.onclose = () => {
      console.log('Server connection closed');
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
