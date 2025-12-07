import './Chat.css';
import React, { useState, useEffect, useContext, useRef } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';

function Chat({ userName, meetingId }) {
  const socket = useContext(WebSocketContext);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const currentUserLabel = userName || 'Вы';

  // Подписываемся на события WebSocket для получения истории и новых сообщений
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat' || data.type === 'message') {
        // Получили новое сообщение чата
        if (data.message && typeof data.message === 'object') {
          // Если сообщение пришло как объект ChatMessage
          setMessages((prev) => [
            ...prev,
            { sender: data.message.userName || 'Гость', message: data.message.content }
          ]);
        } else {
          // На случай альтернативного формата
          setMessages((prev) => [
            ...prev,
            { sender: data.senderName || data.sender || 'Гость', message: data.message }
          ]);
        }
      }
    };
    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  // Скроллим вниз по мере появления новых сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Отправка сообщения
  const sendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Отправляем сообщение сразу по WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'chat',
        message: trimmed,
        senderName: userName
      }));
    }
    // Добавляем сообщение в локальный список (от текущего пользователя)
    setMessages((prev) => [...prev, { sender: currentUserLabel, message: trimmed }]);
    setMessage('');
  };

  const onEnterPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender === currentUserLabel ? 'self' : ''}`}>
            <div className="sender">{msg.sender || 'Гость'}</div>
            <div className="bubble">{msg.message}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="message-input">
        <textarea
          placeholder="Напишите сообщение..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={onEnterPress}
        />
        <button onClick={sendMessage}>Отправить</button>
      </div>
    </div>
  );
}

export default Chat;
