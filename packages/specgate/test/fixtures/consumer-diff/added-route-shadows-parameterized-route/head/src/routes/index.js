const express = require('express');
const itemRoutes = require('./items.route');
const accountRoutes = require('./accounts.route');

const router = express.Router();
router.use('/items', itemRoutes);
router.use('/accounts', accountRoutes);

module.exports = router;
