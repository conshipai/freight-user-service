// src/routes/bols.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bolService = require('../services/bolService');

// Generate new BOL
router.post('/generate', async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user?._id;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID required' 
      });
    }
    
    const result = await bolService.generateBOL(bookingId, userId);
    res.json(result);
    
  } catch (error) {
    console.error('BOL generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get BOL by booking ID
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bol = await bolService.getBOLByBookingId(bookingId);
    
    if (!bol) {
      return res.status(404).json({ 
        success: false, 
        error: 'BOL not found' 
      });
    }
    
    res.json({ success: true, bol });
  } catch (error) {
    console.error('Error fetching BOL:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Serve PDF files
router.get('/pdf/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '../../uploads/bols', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
    
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
