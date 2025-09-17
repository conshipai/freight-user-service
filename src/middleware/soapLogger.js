// src/middleware/soapLogger.js
const fs = require('fs').promises;
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');

const setupSoapLogging = (soapClient, providerName) => {
  // Log requests
  soapClient.on('request', (xml, eid) => {
    const timestamp = new Date().toISOString();
    console.log(`\n📤 [${timestamp}] SOAP REQUEST from ${providerName}:`);
    console.log(xml.substring(0, 2000)); // First 2000 chars
    
    const logFile = path.join(logsDir, `soap-${new Date().toISOString().split('T')[0]}.log`);
    const logData = {
      timestamp,
      provider: providerName,
      type: 'REQUEST',
      xml: xml
    };
    fs.appendFile(logFile, JSON.stringify(logData) + '\n').catch(console.error);
  });

  // Log responses
  soapClient.on('response', (body, response, eid) => {
    const timestamp = new Date().toISOString();
    console.log(`\n📥 [${timestamp}] SOAP RESPONSE for ${providerName}:`);
    console.log(body.substring(0, 2000)); // First 2000 chars
    
    const logFile = path.join(logsDir, `soap-${new Date().toISOString().split('T')[0]}.log`);
    const logData = {
      timestamp,
      provider: providerName,
      type: 'RESPONSE',
      statusCode: response?.statusCode,
      body: body
    };
    fs.appendFile(logFile, JSON.stringify(logData) + '\n').catch(console.error);
  });

  // Log SOAP faults
  soapClient.on('soapError', (error, eid) => {
    console.error(`\n❌ SOAP FAULT for ${providerName}:`, error);
  });
};

module.exports = { setupSoapLogging };
