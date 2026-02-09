const express = require('express');
const SettingController = require('../controllers/SystemSetting.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, authorize(['SUPER_ADMIN']), SettingController.getSettings);
router.post('/', authenticate, authorize(['SUPER_ADMIN']), SettingController.updateSettings);

module.exports = router;
