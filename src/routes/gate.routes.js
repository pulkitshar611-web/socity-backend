const express = require('express');
const GateController = require('../controllers/Gate.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

// Admin / Society Staff Routes (Authenticated)
router.get('/', authenticate, GateController.list);
router.post('/', authenticate, authorize(['ADMIN', 'COMMUNITY_MANAGER']), GateController.create);
router.patch('/:id/toggle', authenticate, authorize(['ADMIN', 'COMMUNITY_MANAGER']), GateController.toggle);
router.delete('/:id', authenticate, authorize(['ADMIN', 'COMMUNITY_MANAGER']), GateController.remove);

// Public QR Routes (No auth required)
router.get('/public/:gateId/validate', GateController.validate);
router.get('/public/:gateId/units', GateController.getUnits);
router.post('/public/:gateId/walk-in', upload.single('photo'), GateController.submitEntry);

module.exports = router;
