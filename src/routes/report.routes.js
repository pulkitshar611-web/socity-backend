const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ReportController = require('../controllers/Report.controller');

const router = express.Router();

router.get('/platform-stats', authenticate, authorize(['SUPER_ADMIN']), ReportController.getPlatformStats);

router.get('/download', authenticate, authorize(['ADMIN']), async (req, res) => {
  res.json({ message: 'Report generation started. This feature will be available soon.' });
});

module.exports = router;
