const mongoose = require('mongoose');

// ─── PrinterSession Schema ───────────────────────────────────────────────────
const PrinterSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  label: {
    type: String,
    default: 'Printer Station'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  qrCodeDataUrl: String,
  sessionUrl: String,
  connectedSocketId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  }
});

// ─── PrintJob Schema ─────────────────────────────────────────────────────────
const PrintJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
    ref: 'PrinterSession'
  },
  studentName: {
    type: String,
    default: 'Anonymous'
  },
  files: [
    {
      originalName: { type: String, required: true },
      storedName: { type: String, required: true },
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      mimeType: { type: String, required: true },
      fileSize: { type: Number, required: true },
      pageCount: { type: Number, default: 1 }
    }
  ],
  settings: {
    orientation: {
      type: String,
      enum: ['portrait', 'landscape'],
      default: 'portrait'
    },
    copies: {
      type: Number,
      default: 1,
      min: 1,
      max: 20
    },
    colorMode: {
      type: String,
      enum: ['color', 'grayscale'],
      default: 'grayscale'
    },
    paperSize: {
      type: String,
      enum: ['A4', 'A3', 'Letter'],
      default: 'A4'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'printing', 'printed', 'failed', 'abandoned'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  printedAt: {
    type: Date,
    default: null
  },
  deleteAfter: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
});

PrintJobSchema.methods.markPrinted = function () {
  this.status = 'printed';
  this.printedAt = new Date();
  this.deleteAfter = new Date(Date.now() + 60 * 60 * 1000);
  return this.save();
};

const PrinterSession = mongoose.model('PrinterSession', PrinterSessionSchema);
const PrintJob = mongoose.model('PrintJob', PrintJobSchema);

module.exports = { PrinterSession, PrintJob };