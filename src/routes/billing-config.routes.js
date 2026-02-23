const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/BillingConfig.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const adminOnly = [authenticate, authorize(['ADMIN'])];

// Get full config
router.get('/config', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), ctrl.getConfig);

// Maintenance rules
router.post('/maintenance/:id', ...adminOnly, ctrl.upsertMaintenanceRule);
router.delete('/maintenance/:id', ...adminOnly, ctrl.deleteMaintenanceRule);

// Charge master
router.post('/charges', ...adminOnly, ctrl.createCharge);
router.put('/charges/:id', ...adminOnly, ctrl.updateCharge);
router.delete('/charges/:id', ...adminOnly, ctrl.deleteCharge);

// Late fee config
router.post('/late-fee', ...adminOnly, ctrl.upsertLateFeeConfig);

module.exports = router;
