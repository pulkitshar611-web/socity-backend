const express = require('express');
const router = express.Router();
const patrollingController = require('../controllers/Patrolling.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Get all logs
router.get('/', patrollingController.getAll);

// Create new log
router.post('/', patrollingController.create);

module.exports = router;
