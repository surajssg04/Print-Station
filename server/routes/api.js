const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs-extra');
const { PrinterSession, PrintJob } = require('../models/schemas');
const { upload, UPLOAD_DIR } = require('../config/multer');

// ─── SESSION ROUTES ──────────────────────────────────────────────────────────

// POST /api/sessions — Create a new printer session
router.post('/sessions', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const label = req.body.label || 'Printer Station';
    const BASE_URL = process.env.BASE_URL || `http://${req.hostname}:${process.env.PORT || 3000}`;
    const sessionUrl = `${BASE_URL}/upload/${sessionId}`;

    const qrCodeDataUrl = await QRCode.toDataURL(sessionUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    const session = new PrinterSession({
      sessionId,
      label,
      sessionUrl,
      qrCodeDataUrl
    });

    await session.save();

    res.json({
      success: true,
      sessionId,
      sessionUrl,
      qrCodeDataUrl,
      label
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sessions/:sessionId — Get session info
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const session = await PrinterSession.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/sessions/:sessionId — Close a session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await PrinterSession.updateOne(
      { sessionId: req.params.sessionId },
      { status: 'inactive' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PRINT JOB ROUTES ────────────────────────────────────────────────────────

// POST /api/jobs/:sessionId — Submit a new print job with file uploads
router.post('/jobs/:sessionId', upload.array('files', 10), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session exists and is active
    const session = await PrinterSession.findOne({ sessionId, status: 'active' });
    if (!session) {
      // Clean up uploaded files if session invalid
      if (req.files) {
        for (const f of req.files) await fs.remove(f.path);
      }
      return res.status(404).json({ success: false, error: 'Printer session not found or inactive' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const { orientation, copies, colorMode, paperSize, studentName } = req.body;

    const jobId = uuidv4();
    const files = req.files.map(f => ({
      originalName: f.originalname,
      storedName: f.filename,
      filePath: f.path,
      mimeType: f.mimetype,
      fileSize: f.size
    }));

    const job = new PrintJob({
      jobId,
      sessionId,
      studentName: studentName || 'Anonymous',
      files,
      settings: {
        orientation: orientation || 'portrait',
        copies: Math.min(parseInt(copies) || 1, 20),
        colorMode: colorMode || 'grayscale',
        paperSize: paperSize || 'A4'
      }
    });

    await job.save();

    // Emit to the correct printer dashboard via Socket.IO
    const io = req.app.get('io');
    io.to(`session:${sessionId}`).emit('new_job', {
      jobId,
      studentName: job.studentName,
      fileCount: files.length,
      files: files.map(f => ({
        originalName: f.originalName,
        storedName: f.storedName,
        mimeType: f.mimeType,
        fileSize: f.fileSize
        })),
      settings: job.settings,
      submittedAt: job.submittedAt
    });

    res.json({ success: true, jobId });
  } catch (err) {
    console.error('Submit job error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/jobs/:sessionId — List all pending jobs for a session
router.get('/jobs/:sessionId', async (req, res) => {
  try {
    const jobs = await PrintJob.find({
      sessionId: req.params.sessionId,
      status: { $in: ['pending', 'printing'] }
    }).sort({ submittedAt: -1 });

    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/jobs/detail/:jobId — Get a single job's details
router.get('/jobs/detail/:jobId', async (req, res) => {
  try {
    const job = await PrintJob.findOne({ jobId: req.params.jobId });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/files/:sessionId/:filename — Serve a file for preview/print
router.get('/files/:sessionId/:filename', async (req, res) => {
  try {
    const { sessionId, filename } = req.params;

    if (!/^[\w\-]+\.(pdf|jpg|jpeg|png)$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const job = await PrintJob.findOne({
      sessionId,
      'files.storedName': filename
    });

    if (!job) {
      return res.status(404).json({ error: 'File record not found in database' });
    }

    const file = job.files.find(f => f.storedName === filename);

    if (!file || !file.filePath) {
      return res.status(404).json({ error: 'Stored file path missing' });
    }

    const exists = await fs.pathExists(file.filePath);
    if (!exists) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.type(file.mimeType || 'application/octet-stream');
    return res.sendFile(path.resolve(file.filePath));
  } catch (err) {
    console.error('Serve file error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:jobId/status — Update job status (printing, printed, failed)
router.patch('/jobs/:jobId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const job = await PrintJob.findOne({ jobId: req.params.jobId });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    if (status === 'printed') {
      await job.markPrinted();
    } else {
      job.status = status;
      await job.save();
    }

    // Notify dashboard of status update
    const io = req.app.get('io');
    io.to(`session:${job.sessionId}`).emit('job_status_update', {
      jobId: job.jobId,
      status: job.status
    });

    res.json({ success: true, status: job.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/jobs/:jobId — Manually delete a job
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const job = await PrintJob.findOne({ jobId: req.params.jobId });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Remove files
    for (const f of job.files) {
      await fs.remove(f.filePath).catch(() => {});
    }

    await PrintJob.deleteOne({ jobId: req.params.jobId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;