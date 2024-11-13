// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import Home from './components/Home/Home';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import VideoCall from './components/VideoCall/VideoCall';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/videocall" component={VideoCall} />
        <Route path="/home" component={Home} />
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route path="/" component={Login} />
      </Routes>
    </Router>
  );
}

export default App;
