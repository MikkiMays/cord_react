import './Chat.css';
import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { WebSocketContext } from '../../contexts/WebSocketContext';

/**
 * Компонент чата для видеовстречи.
 * 
 * Протокол:
 * - chat-history: получаем историю при подключении
 * - chat: отправляем/получаем сообщения
 * 
 * Сервер отправляет сообщения только ДРУГИМ участникам,
 * поэтому свои сообщения добавляем локально с флагом isSelf.
 */

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function Chat({ userName, meetingId }) {
  const socket = useContext(WebSocketContext);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const seenIds = useRef(new Set());
  const sentMessageIds = useRef(new Set()); // Храним ID отправленных нами сообщений

  const myName = userName || 'Вы';

  /**
   * Добавление сообщения с дедупликацией
   */
  const addMessage = useCallback((msg) => {
    if (!msg || seenIds.current.has(msg.id)) {
      return;
    }
    seenIds.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * Нормализация сообщения из разных форматов
   * @param {Object} raw - сырое сообщение
   * @param {boolean} isFromSelf - флаг, что сообщение от нас
   */
  const normalizeMessage = useCallback((raw, isFromSelf = false) => {
    if (!raw) return null;

    // Может быть объект или строка
    const data = typeof raw === 'string' ? { content: raw } : raw;

    // Извлекаем поля
    const sender = data.userName || data.senderName || data.sender || 'Участник';
    const text = data.content || data.text || (typeof data.message === 'string' ? data.message : '') || '';
    const timestamp = data.timestamp || Date.now();

    if (!text.trim()) return null;

    // ID для дедупликации
    const id = data.clientMessageId || data.id || `${data.sessionId || sender}-${timestamp}-${text.slice(0, 10)}`;

    return { 
      id, 
      sender, 
      text: text.trim(), 
      timestamp,
      isSelf: isFromSelf // Явный флаг, что сообщение наше
    };
  }, []);

  /**
   * Обработка WebSocket сообщений
   */
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (data.type === 'chat-history') {
        // История при подключении
        const items = data.items || [];
        items.forEach((item) => {
          // Проверяем, было ли это сообщение отправлено нами
          const msgId = item.clientMessageId || item.id;
          const wasFromSelf = sentMessageIds.current.has(msgId);
          const msg = normalizeMessage(item, wasFromSelf);
          if (msg) addMessage(msg);
        });
      } else if (data.type === 'chat') {
        // Новое сообщение от ДРУГОГО участника (сервер не отправляет нам наши сообщения)
        const incoming = data.message || data;
        // Это сообщение точно НЕ от нас, так как сервер не отправляет обратно
        const msg = normalizeMessage(incoming, false);
        if (msg) addMessage(msg);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, normalizeMessage, addMessage]);

  /**
   * Прокрутка к последнему сообщению
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Отправка сообщения
   */
  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    const clientMessageId = generateId();

    // Запоминаем ID отправленного сообщения
    sentMessageIds.current.add(clientMessageId);

    // Отправляем на сервер
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'chat',
        content: text,
        clientMessageId,
      }));
    }

    // Добавляем локально (сервер не отправляет нам обратно)
    addMessage({
      id: clientMessageId,
      sender: myName,
      text,
      timestamp: Date.now(),
      isSelf: true, // Явно помечаем как своё сообщение
    });

    setInputText('');
  }, [socket, inputText, myName, addMessage]);

  /**
   * Enter для отправки
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Сортированные сообщения
   */
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.timestamp - b.timestamp),
    [messages]
  );

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <p className="eyebrow">Чат встречи</p>
          <h4>{meetingId || 'Встреча'}</h4>
        </div>
        <span className="pill light">{sortedMessages.length}</span>
      </div>

      <div className="messages">
        {sortedMessages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.isSelf ? 'self' : ''}`}
          >
            <div className="sender">{msg.isSelf ? myName : msg.sender}</div>
            <div className="bubble">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="message-input"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <textarea
          placeholder="Напишите сообщение…"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit">Отправить</button>
      </form>
    </div>
  );
}

export default Chat;
