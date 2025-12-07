const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

export async function createMeeting(payload = {}) {
  return request('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMeeting(meetingId) {
  if (!meetingId) throw new Error('Missing meetingId');
  return request(`/api/meetings/${meetingId}`);
}

export async function joinMeeting(meetingId, name) {
  if (!meetingId) throw new Error('Missing meetingId');
  return request(`/api/meetings/${meetingId}/join`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function sendChatMessage(meetingId, userId, message) {
  if (!meetingId) throw new Error('Missing meetingId');
  return request(`/api/meetings/${meetingId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ userId, message }),
  });
}

export async function fetchParticipants(meetingId) {
  if (!meetingId) throw new Error('Missing meetingId');
  return request(`/api/meetings/${meetingId}/participants`);
}

const api = {
  createMeeting,
  fetchMeeting,
  joinMeeting,
  sendChatMessage,
  fetchParticipants,
};

export default api;
