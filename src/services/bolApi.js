// src/services/bolApi.js
const API_URL = process.env.REACT_APP_API_URL || 'https://api.gcc.conship.ai';

class BOLApi {
  async generateBOL(bookingId) {
    const response = await fetch(`${API_URL}/api/bols/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
      },
      body: JSON.stringify({ bookingId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate BOL');
    }
    
    return response.json();
  }
  
  async getBOL(bookingId) {
    const response = await fetch(`${API_URL}/api/bols/booking/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get BOL');
    }
    
    return response.json();
  }
  
  getPDFUrl(filename) {
    return `${API_URL}/api/bols/pdf/${filename}`;
  }
}

export default new BOLApi();
