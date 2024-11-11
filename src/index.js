import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { WebSocketProvider } from './contexts/WebSocketContext';

ReactDOM.render(
  <WebSocketProvider>
    <App />
  </WebSocketProvider>,
  document.getElementById('root')
);