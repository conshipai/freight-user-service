// src/middleware/apiLogger.js
const fs = require('fs').promises;
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
fs.mkdir(logsDir, { recursive: true }).catch(console.error);

// Intercept axios globally
const setupAxiosLogging = (axios) => {
  // Request interceptor
  axios.interceptors.request.use(
    (config) => {
      const timestamp = new Date().toISOString();
      const logData = {
        timestamp,
        type: 'REQUEST',
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        headers: config.headers,
        params: config.params,
        data: config.data
      };
      
      console.log(`\n📤 [${timestamp}] API REQUEST: ${config.method?.toUpperCase()} ${config.baseURL || ''}${config.url}`);
      console.log('Headers:', JSON.stringify(config.headers, null, 2));
      if (config.params) console.log('Params:', JSON.stringify(config.params, null, 2));
      if (config.data) console.log('Body:', JSON.stringify(config.data, null, 2).substring(0, 1000));
      
      // Also write to file
      const logFile = path.join(logsDir, `api-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFile(logFile, JSON.stringify(logData) + '\n').catch(console.error);
      
      return config;
    },
    (error) => {
      console.error('❌ Request Error:', error.message);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axios.interceptors.response.use(
    (response) => {
      const timestamp = new Date().toISOString();
      const logData = {
        timestamp,
        type: 'RESPONSE',
        status: response.status,
        statusText: response.statusText,
        url: response.config?.url,
        headers: response.headers,
        data: response.data
      };
      
      console.log(`\n📥 [${timestamp}] API RESPONSE: ${response.status} from ${response.config?.url}`);
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
      if (response.data) {
        const dataStr = typeof response.data === 'string' 
          ? response.data.substring(0, 1000)
          : JSON.stringify(response.data, null, 2).substring(0, 1000);
        console.log('Body:', dataStr);
      }
      
      // Write to file
      const logFile = path.join(logsDir, `api-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFile(logFile, JSON.stringify(logData) + '\n').catch(console.error);
      
      return response;
    },
    (error) => {
      const timestamp = new Date().toISOString();
      console.error(`\n❌ [${timestamp}] API ERROR: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`URL: ${error.config?.url}`);
        console.error('Response:', JSON.stringify(error.response.data, null, 2).substring(0, 1000));
      }
      return Promise.reject(error);
    }
  );
};

module.exports = { setupAxiosLogging };
