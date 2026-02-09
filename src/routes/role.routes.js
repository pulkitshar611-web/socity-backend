const express = require('express');
const router = express.Router();
const RoleController = require('../controllers/RoleModel.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), RoleController.listRoles);
router.post('/', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), RoleController.createRole);
router.patch('/:roleId/permissions', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), RoleController.togglePermission);
router.get('/permissions', authenticate, authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']), RoleController.listPermissions);

module.exports = router;
