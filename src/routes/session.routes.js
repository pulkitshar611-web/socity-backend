const express = require('express');
const router = express.Router();
const SessionController = require('../controllers/UserSession.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), SessionController.listSessions);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), SessionController.terminateSession);
router.delete('/', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), SessionController.terminateAll);

module.exports = router;
