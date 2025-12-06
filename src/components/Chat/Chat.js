import './Chat.css';
import React, { useState, useEffect, useContext, useRef } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';
import { fetchChatHistory, sendChatMessage } from '../../services/api';

function Chat({ userName, meetingId }) {
  const socket = useContext(WebSocketContext);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const currentUserId = userName || 'Вы';

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await fetchChatHistory(meetingId);
        if (Array.isArray(history)) {
          setMessages((prev) =>
            prev.length
              ? prev
              : history.map((item) => ({ sender: item.senderName || item.sender, message: item.message }))
          );
        }
      } catch (error) {
        console.warn('Не удалось загрузить историю чата', error);
      }
    };

    if (meetingId) {
      loadHistory();
    }
  }, [meetingId]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message' || data.type === 'chat') {
        setMessages((prevMessages) => [
          ...prevMessages,
          { sender: data.senderName || data.sender, message: data.message },
        ]);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    try {
      await sendChatMessage(meetingId, currentUserId, trimmed);
    } catch (error) {
      console.warn('Backend чат недоступен, отправляем только по WebSocket', error);
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: 'chat', sender: currentUserId, senderName: userName, message: trimmed })
      );
    }
    setMessages((prev) => [...prev, { sender: currentUserId, message: trimmed }]);
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
          <div key={index} className={`message ${msg.sender === currentUserId ? 'self' : ''}`}>
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
