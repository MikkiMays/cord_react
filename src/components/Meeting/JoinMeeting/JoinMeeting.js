import React, { useState } from 'react';
import './JoinMeeting.css';

function JoinMeeting({ defaultName = '', onJoin, loading, error }) {
  const [userName, setUserName] = useState(defaultName);

  const handleSubmit = (event) => {
    event.preventDefault();
    onJoin(userName || 'Гость');
  };

  return (
    <div className="join-card">
      <div className="preview">
        <div className="placeholder-video">
          <div className="avatar">{(userName || 'Гость').charAt(0).toUpperCase()}</div>
        </div>
      </div>
      <form className="join-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Подключение</p>
        <h3>Представьтесь перед входом</h3>
        <p className="muted">
          Введите имя, чтобы участники встречи знали, кто подключился. Маршруты совместимы с
          backend cord: /api/meetings/:id/join.
        </p>
        <label className="field-label" htmlFor="user-name">Имя</label>
        <input
          id="user-name"
          type="text"
          placeholder="Ваше имя"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        {error && <div className="error-hint">{error}</div>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Проверяем встречу…' : 'Войти в встречу'}
        </button>
      </form>
    </div>
  );
}

export default JoinMeeting;
