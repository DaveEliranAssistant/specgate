const express = require('express');
const accountController = require('../controllers/account.controller');

const router = express.Router();
router.post('/sign-in', accountController.signIn);
const extra = (r) => r.post('/sign-out', accountController.signOut);
extra(router);

module.exports = router;
