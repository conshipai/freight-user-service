// src/routes/storage.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow only PDF, images
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

// Configure R2 client (S3 compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Upload file to R2
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file provided' 
      });
    }

    const { requestId, documentType } = req.body;
    
    if (!requestId || !documentType) {
      return res.status(400).json({ 
        success: false,
        error: 'RequestId and documentType are required' 
      });
    }

    // Create organized key
    const timestamp = Date.now();
    const key = `sds-uploads/${requestId}/${documentType}/${timestamp}-${req.file.originalname}`;
    
    // Upload to R2
    const uploadParams = {
      Bucket: 'sds-uploads',
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        requestId,
        documentType,
        originalName: req.file.originalname,
        uploadedAt: new Date().toISOString()
      }
    };
    
    await r2Client.send(new PutObjectCommand(uploadParams));
    
    // Generate public URL (if bucket is public) or signed URL
    const fileUrl = `${process.env.R2_PUBLIC_URL || 'https://sds-uploads.your-domain.com'}/${key}`;
    
    res.json({
      success: true,
      fileUrl,
      key,
      metadata: {
        size: req.file.size,
        type: req.file.mimetype,
        originalName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get signed URL for download
router.get('/signed-url/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    
    const command = new GetObjectCommand({
      Bucket: 'sds-uploads',
      Key: key
    });
    
    const url = await getSignedUrl(r2Client, command, { 
      expiresIn: 3600 // 1 hour
    });
    
    res.json({
      success: true,
      url
    });
  } catch (error) {
    console.error('Signed URL error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

module.exports = router;
