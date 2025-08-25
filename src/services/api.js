// src/services/api.js
import axios from 'axios';

// Create axios instance with base configuration
const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token if it exists (from shellContext or localStorage)
API.interceptors.request.use(
  (config) => {
    // Try to get token from shellContext first, then localStorage
    const token = window.shellContext?.token || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// API methods
export const airportAPI = {
  // Get nearest airport from ZIP code
  getNearestAirport: async (zipCode) => {
    const response = await API.post('/airports/nearest-airport', { zipCode });
    return response.data;
  },
  
  // Validate airport codes
  getAirportsByCodes: async (codes) => {
    const response = await API.get(`/airports/by-codes?codes=${codes}`);
    return response.data;
  }
};

export const quoteAPI = {
  // Create quote
  createQuote: async (quoteData) => {
    const response = await API.post('/quotes/air', quoteData);
    return response.data;
  }
};

export default API;
