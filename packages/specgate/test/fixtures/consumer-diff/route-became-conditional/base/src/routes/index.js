const express = require('express');
const itemRoutes = require('./items.route');
const accountRoutes = require('./accounts.route');
const settings = require('../settings');

const router = express.Router();

const publicRoutes = [
  { path: '/items', route: itemRoutes },
  { path: '/accounts', route: accountRoutes },
];

const debugRoutes = [];

publicRoutes.forEach((entry) => {
  router.use(entry.path, entry.route);
});

if (settings.debug) {
  debugRoutes.forEach((entry) => {
    router.use(entry.path, entry.route);
  });
}

module.exports = router;
