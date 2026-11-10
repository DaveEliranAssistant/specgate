const express = require('express');
const accountController = require('../controllers/account.controller');

const router = express.Router();
router.post('/sign-in', accountController.signIn);
router.post('/sign-out', accountController.signOut);
router.post('/sign-out-all', accountController.signOut);

module.exports = router;
