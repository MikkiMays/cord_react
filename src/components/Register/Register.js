// src/components/Register.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './Register.css';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegistration = (event) => {
    event.preventDefault();

    const user = {
      username: username,
      email: email,
      password: password,
      status: 'online',
    };

    fetch('http://localhost:8080/api/v1/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
      credentials: 'include',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Registration failed');
        }
        return response.json();
      })
      .then(() => {
        localStorage.setItem('connectedUser', JSON.stringify(user));
        navigate('/home');
      })
      .catch(error => {
        console.error('Ошибка при регистрации:', error);
      });
  };

  return (
    <div className="register-container">
      <div className="social-icons">
        <h2>Join Us</h2>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-instagram"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-facebook"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-linkedin"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-github"></i></a>
      </div>
      <div className="register-form">
        <h2>Register</h2>
        <form onSubmit={handleRegistration}>
          <label>Username:</label>
          <input
            type="text"
            id="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label>Email:</label>
          <input
            type="email"
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>Password:</label>
          <input
            type="password"
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">Register</button>
        </form>
        <p>
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </div>
  );
}

export default Register;
