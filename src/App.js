import React from 'react';
import Home from './components/Home/Home';
import Meeting from './components/Meeting/Meeting';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meeting/:meetingId" element={<Meeting />} />
      </Routes>
    </Router>
  );
}

export default App;
