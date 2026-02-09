const express = require('express');
const router = express.Router();
const GuardDashboardController = require('../controllers/GuardDashboard.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize(['GUARD', 'ADMIN']));

router.get('/stats', GuardDashboardController.getStats);
router.get('/activity', GuardDashboardController.getActivity);

module.exports = router;
