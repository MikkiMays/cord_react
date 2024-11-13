// src/components/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (event) => {
    event.preventDefault();

    const user = {
      email: email,
      password: password,
    };

    fetch('http://localhost:8080/api/v1/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
      credentials: 'include',
    })
      .then(response => {
        if (!response.ok) {
          alert('Login and/or password is incorrect');
          throw new Error('Login failed');
        }
        return response.json();
      })
      .then((response) => {
        localStorage.setItem('connectedUser', JSON.stringify(response));
        navigate('/home');
      })
      .catch(error => {
        console.error('Ошибка при логине:', error);
      });
  };

  return (
    <div className="login-container">
      <div className="social-icons">
        <h2>Join Us</h2>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-instagram"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-facebook"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-linkedin"></i></a>
        <a href="#" target="_blank" rel="noreferrer"><i className="fa fa-github"></i></a>
      </div>
      <div className="login-form">
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
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

          <button type="submit">Login</button>
        </form>
        <p>
          Don't have an account? <a href="/register">Register</a>
        </p>
      </div>
    </div>
  );
}

export default Login;
