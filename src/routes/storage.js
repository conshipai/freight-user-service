// src/routes/storage.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Multer: 20MB memory uploads, PDF/JPG/PNG only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    if (okMime && okExt) return cb(null, true);
    cb(new Error('Only PDF and JPG/PNG image files are allowed'));
  }
});

const forcePath = /^(1|true|yes)$/i.test(process.env.S3_FORCE_PATH_STYLE || '');
const credentials = (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY)
  ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
  : undefined;

// S3-compatible client (works with AWS S3, MinIO, R2 (with S3_* vars), etc.)
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined, // e.g. https://minio.example.com or R2 endpoint
  forcePathStyle: forcePath, // needed for many S3-compatible providers
  credentials
});

// Helpers
const safe = (s, def = '') => String(s ?? def).replace(/[^A-Za-z0-9._-]/g, '_');
const BUCKET = process.env.S3_BUCKET;

// Optional health check
router.get('/health', async (req, res) => {
  try {
    // Test S3 connectivity
    await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      MaxKeys: 1
    }));
    res.json({ 
      ok: true, 
      bucket: BUCKET,
      endpoint: process.env.S3_ENDPOINT || 'default',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ 
      ok: false, 
      error: err.message,
      bucket: BUCKET 
    });
  }
});

// Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 Upload request received:', {
      file: req.file ? req.file.originalname : 'none',
      requestId: req.body?.requestId,
      documentType: req.body?.documentType
    });

    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    if (!BUCKET) return res.status(500).json({ success: false, error: 'S3_BUCKET not set' });

    const { requestId, documentType } = req.body || {};
    if (!requestId || !documentType) {
      return res.status(400).json({ success: false, error: 'requestId and documentType are required' });
    }

    const rid = safe(requestId);
    const dtype = safe(documentType);
    const timestamp = Date.now();
    
    // For BOLs, use a cleaner naming convention
    let filename;
    if (documentType === 'bol' && req.file.originalname.startsWith('BOL-')) {
      filename = safe(req.file.originalname);
    } else {
      const original = safe(req.file.originalname || 'upload');
      filename = `${timestamp}-${original}`;
    }

    // Key: <requestId>/<documentType>/<filename>
    const Key = `${rid}/${dtype}/${filename}`;

    console.log('📁 Uploading to S3:', {
      bucket: BUCKET,
      key: Key,
      size: req.file.size,
      type: req.file.mimetype
    });

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        requestId: rid,
        documentType: dtype,
        originalName: req.file.originalname,
        uploadedAt: new Date().toISOString()
      }
    }));

    // Generate URL - prefer public base (CDN/custom domain), else presigned URL
    const publicBase = (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, '');
    const encodedKey = encodeURIComponent(Key).replace(/%2F/g, '/');

    let fileUrl;
    if (publicBase) {
      // S3_PUBLIC_BASE should already include bucket if your host requires it (path-style),
      // e.g. https://minio.example.com/mybucket  or  https://cdn.example.com
      fileUrl = `${publicBase}/${encodedKey}`;
    } else {
      fileUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key }),
        { expiresIn: 3600 }
      );
    }

    console.log('✅ Upload successful:', fileUrl);

    res.json({
      success: true,
      fileUrl,
      key: Key,
      fileName: filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      requestId: rid,
      documentType: dtype
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large (max 20MB)'
      : err.message || 'Upload failed';
    res.status(500).json({ success: false, error: message });
  }
});

// List documents for a request
router.get('/documents/:requestId', async (req, res) => {
  try {
    if (!BUCKET) return res.status(500).json({ success: false, error: 'S3_BUCKET not set' });
    
    const { requestId } = req.params;
    const rid = safe(requestId);
    
    console.log('📂 Listing documents for request:', rid);

    const response = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${rid}/`
    }));

    const documents = [];
    if (response.Contents) {
      for (const object of response.Contents) {
        const keyParts = object.Key.split('/');
        const documentType = keyParts[1] || 'unknown';
        const fileName = keyParts[2] || 'unknown';

        // Generate URL for each document
        const publicBase = (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, '');
        const encodedKey = encodeURIComponent(object.Key).replace(/%2F/g, '/');
        
        let fileUrl;
        if (publicBase) {
          fileUrl = `${publicBase}/${encodedKey}`;
        } else {
          fileUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: BUCKET, Key: object.Key }),
            { expiresIn: 3600 }
          );
        }

        documents.push({
          key: object.Key,
          fileUrl,
          documentType,
          fileName,
          size: object.Size,
          lastModified: object.LastModified,
          etag: object.ETag
        });
      }
    }

    console.log(`✅ Found ${documents.length} documents for request ${rid}`);

    res.json({
      success: true,
      requestId: rid,
      documentCount: documents.length,
      documents
    });
  } catch (err) {
    console.error('❌ Error listing documents:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to list documents' 
    });
  }
});

// On-demand signed URL
router.get('/signed-url/*', async (req, res) => {
  try {
    if (!BUCKET) return res.status(500).json({ success: false, error: 'S3_BUCKET not set' });
    const Key = decodeURIComponent(req.params[0] || '');
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key }),
      { expiresIn: 3600 }
    );
    res.json({ success: true, url });
  } catch (err) {
    console.error('Signed URL error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate signed URL' });
  }
});

module.exports = router;
