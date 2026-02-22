const express = require('express');
const GateController = require('../controllers/Gate.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

// ─── Admin routes (require auth) ───
router.get('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), GateController.list);
router.post('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), GateController.create);
router.patch('/:id/toggle', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), GateController.toggle);
router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), GateController.remove);

// ─── Public routes (NO auth — used by QR scan) ───
router.get('/public/:gateId/validate', GateController.validateGate);
router.get('/public/:gateId/units', GateController.getGateUnits);
router.post('/public/:gateId/walk-in', upload.single('photo'), GateController.walkInEntry);

module.exports = router;
