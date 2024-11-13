// src/components/Home.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './Home.css';

function Home() {
  const [userList, setUserList] = useState([]);
  const [meetingName, setMeetingName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const connectedUser = localStorage.getItem('connectedUser');
    if (!connectedUser) {
      navigate('/login');
      return;
    }

    // Загрузка пользователей
    fetch('http://localhost:8080/api/v1/users')
      .then((response) => response.json())
      .then((data) => setUserList(data))
      .catch((error) => console.error('Ошибка:', error));
  }, [navigate]);

  const handleLogout = () => {
    fetch('http://localhost:8080/api/v1/users/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: localStorage.getItem('connectedUser'),
    })
      .then(() => {
        localStorage.removeItem('connectedUser');
        navigate('/login');
      })
      .catch((error) => console.error('Ошибка:', error));
  };

  const handleNewMeeting = () => {
    const connectedUser = JSON.parse(localStorage.getItem('connectedUser'));
    window.open(`/videocall?username=${connectedUser.username}`, "_blank");
  };

  const handleJoinMeeting = () => {
    const connectedUser = JSON.parse(localStorage.getItem('connectedUser'));
    const url = `/videocall?meetingId=${meetingName}&username=${connectedUser.username}`;
    window.open(url, "_blank");
  };

  return (
    <div className="home-container">
      <div className="main">
        <div className="new-meeting">
          <button onClick={handleNewMeeting}>Create a New Meeting</button>
          <div className="join-meeting">
            <input
              type="text"
              placeholder="Meeting ID"
              id="meetingName"
              value={meetingName}
              onChange={(e) => setMeetingName(e.target.value)}
            />
            <button onClick={handleJoinMeeting}>Join</button>
          </div>
        </div>
        <div className="connected-users">
          <button id="logoutBtn" onClick={handleLogout}>Logout</button>
          <h2>Connected Users</h2>
          <ul id="userList">
            {userList.map((user) => (
              <li key={user.email}>
                <div>
                  <i className="fa fa-user-circle"></i>
                  {user.username} <i className="user-email">({user.email})</i>
                </div>
                <i className={`fa fa-lightbulb-o ${user.status === "online" ? "online" : "offline"}`}></i>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Home;
