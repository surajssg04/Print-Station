const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
fs.ensureDirSync(UPLOAD_DIR);

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const sessionId = req.params.sessionId || req.body.sessionId || 'unknown';
    const jobDir = path.join(UPLOAD_DIR, sessionId);
    await fs.ensureDir(jobDir);
    cb(null, jobDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (ALLOWED_MIMES.includes(mime) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Allowed: PDF, JPG, PNG`), false);
  }
};

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 50;

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE_MB * 1024 * 1024,
    files: 10
  }
});

module.exports = { upload, UPLOAD_DIR };