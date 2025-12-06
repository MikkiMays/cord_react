import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home/Home';
import Meeting from './components/Meeting/Meeting';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './App.css';

function App() {
  return (
    <div className="app-shell">
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/meeting/:meetingId" element={<Meeting />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
