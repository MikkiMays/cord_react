// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client'; // Используем API React 18
import './index.css'; // Глобальные стили
import App from './App';
import { WebSocketProvider } from './components/context/WebSocketContext';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {/* Временно передадим фиктивный meetingId */}
    <WebSocketProvider meetingId="sample-meeting-id">
      <App />
    </WebSocketProvider>
  </React.StrictMode>
);
