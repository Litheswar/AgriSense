const express = require('express');
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/authentication');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
