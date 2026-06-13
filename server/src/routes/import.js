const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { parseAndAnalyze, commitImport, getImportReport } = require('../services/importService');

const router = express.Router();

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `import_${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// POST /api/groups/:id/import/parse — Upload + parse + detect anomalies
router.post('/groups/:id/import/parse', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    let csvContent;

    if (req.file) {
      csvContent = fs.readFileSync(req.file.path, 'utf-8');
    } else if (req.body.csv_content) {
      csvContent = req.body.csv_content;
    } else {
      return res.status(400).json({ error: 'No CSV file or content provided.' });
    }

    const result = await parseAndAnalyze(csvContent, req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Import parse error:', err);
    res.status(500).json({ error: 'Failed to parse CSV.', details: err.message });
  }
});

// POST /api/groups/:id/import/confirm — Commit import with user decisions
router.post('/groups/:id/import/confirm', authMiddleware, async (req, res) => {
  try {
    const { import_id, decisions } = req.body;

    if (!import_id || !decisions) {
      return res.status(400).json({ error: 'import_id and decisions are required.' });
    }

    const result = await commitImport(import_id, req.params.id, req.user.id, decisions);
    res.json(result);
  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Failed to commit import.', details: err.message });
  }
});

// GET /api/groups/:id/import-reports — List import reports
router.get('/groups/:id/import-reports', authMiddleware, async (req, res) => {
  try {
    const [reports] = await pool.query(
      `SELECT ir.*, u.display_name as imported_by_name
       FROM import_reports ir JOIN users u ON ir.imported_by = u.id
       WHERE ir.group_id = ? ORDER BY ir.created_at DESC`,
      [req.params.id]
    );
    res.json({ reports });
  } catch (err) {
    console.error('List import reports error:', err);
    res.status(500).json({ error: 'Failed to fetch import reports.' });
  }
});

// GET /api/import-reports/:id — Get detailed import report
router.get('/import-reports/:id', authMiddleware, async (req, res) => {
  try {
    const report = await getImportReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.json({ report });
  } catch (err) {
    console.error('Get import report error:', err);
    res.status(500).json({ error: 'Failed to fetch report.' });
  }
});

module.exports = router;
