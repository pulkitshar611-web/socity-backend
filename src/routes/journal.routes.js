const express = require('express');
const JournalEntryController = require('../controllers/JournalEntry.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), JournalEntryController.create);
router.get('/', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), JournalEntryController.list);

module.exports = router;
