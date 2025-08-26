// src/routes/storage.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

// R2 (S3-compatible) client
const r2 = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint:
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Small helper to keep path segments clean
const safe = (s, def = '') => String(s ?? def).replace(/[^A-Za-z0-9._-]/g, '_');

// Optional health check
router.get('/health', (_req, res) => res.json({ ok: true }));

// Upload route
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const { requestId, documentType } = req.body || {};
    if (!requestId || !documentType) {
      return res.status(400).json({ success: false, error: 'requestId and documentType are required' });
    }

    const Bucket = process.env.R2_BUCKET;
    if (!Bucket) return res.status(500).json({ success: false, error: 'R2_BUCKET not set' });

    const rid = safe(requestId);
    const dtype = safe(documentType);
    const original = safe(req.file.originalname || 'upload');

    // Key format: <requestId>/<documentType>/<ts>-<original>
    const Key = `${rid}/${dtype}/${Date.now()}-${original}`;

    await r2.send(new PutObjectCommand({
      Bucket,
      Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        requestId: rid,
        documentType: dtype,
        originalName: original,
        uploadedAt: new Date().toISOString()
      }
    }));

    // Prefer a public base (CDN/custom domain). Else fall back to presigned download.
    const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
    const encodedKey = encodeURIComponent(Key).replace(/%2F/g, '/');

    let fileUrl;
    if (publicBase) {
      fileUrl = `${publicBase}/${encodedKey}`;
    } else {
      // one-hour presigned URL
      fileUrl = await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket, Key }),
        { expiresIn: 3600 }
      );
    }

    res.json({
      success: true,
      fileUrl,
      key: Key,
      metadata: {
        size: req.file.size,
        type: req.file.mimetype,
        originalName: req.file.originalname
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large (max 20MB)'
      : err.message || 'Upload failed';
    res.status(500).json({ success: false, error: message });
  }
});

// On-demand signed URL (if you need it)
router.get('/signed-url/*', async (req, res) => {
  try {
    const Key = decodeURIComponent(req.params[0] || '');
    const Bucket = process.env.R2_BUCKET;
    if (!Bucket) return res.status(500).json({ success: false, error: 'R2_BUCKET not set' });

    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket, Key }),
      { expiresIn: 3600 }
    );

    res.json({ success: true, url });
  } catch (err) {
    console.error('Signed URL error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate signed URL' });
  }
});

module.exports = router;
