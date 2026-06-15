const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload dirs exist
const ATTACHMENT_DIR = path.join(__dirname, '..', 'uploads', 'attachments');
const IMPORT_DIR = path.join(__dirname, '..', 'uploads', 'imports');
[ATTACHMENT_DIR, IMPORT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// Allowed MIME types for project attachments
const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/zip',
];

// Allowed MIME types for import files
const ALLOWED_IMPORT_TYPES = [
  'text/xml', 'application/xml',
  'text/csv', 'application/csv',
  'application/json', 'text/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
];

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACHMENT_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMPORT_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `import_${Date.now()}${ext}`);
  },
});

const attachmentFilter = (req, file, cb) => {
  if (ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const importFilter = (req, file, cb) => {
  // Also allow by extension for files with text/plain mime
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.xml', '.csv', '.json', '.xlsx', '.xls', '.txt'];
  if (ALLOWED_IMPORT_TYPES.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Import file type not supported. Use XML, CSV, JSON, or Excel.`), false);
  }
};

const uploadAttachment = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFilter,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 }, // 20MB max, 5 files at once
});

const uploadImport = multer({
  storage: importStorage,
  fileFilter: importFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

module.exports = { uploadAttachment, uploadImport, ATTACHMENT_DIR, IMPORT_DIR };
