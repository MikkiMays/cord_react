import './Chat.css';
import React, { useState, useEffect, useContext } from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';

function Chat() {
  const socket = useContext(WebSocketContext);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const currentUserId = '1'; // Замените на реальный ID пользователя

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'message') {
        setMessages((prevMessages) => [
          ...prevMessages,
          { sender: data.sender, message: data.message },
        ]);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);

  const sendMessage = async () => {
    if (!message) {
      alert('Введите сообщение');
      return;
    }

    const channelId = '1'; // Укажите реальный ID канала

    try {
      const response = await fetch(`http://localhost:8080/api/chat/${channelId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          message: message,
        }),
      });

      if (response.ok) {
        console.log('Сообщение отправлено:', message);
        socket.send(
          JSON.stringify({ type: 'message', sender: currentUserId, message: message })
        );
        setMessage('');
      } else {
        console.error('Ошибка при отправке сообщения');
      }
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  return (
    <div className="chat-container">
    <div className="messages">
      {messages.map((msg, index) => (
        <div key={index}>
          {msg.sender}: {msg.message}
        </div>
      ))}
    </div>
    <div className="message-input">
      <input
        type="text"
        placeholder="Введите сообщение"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={sendMessage}>Отправить</button>
    </div>
  </div>
  );
}

export default Chat;
