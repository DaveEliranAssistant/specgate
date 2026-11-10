const express = require('express');
const accountController = require('../controllers/account.controller');

const router = express.Router();
router.post('/sign-in', accountController.signIn);
router.post('/logout', accountController.signOut);

module.exports = router;
