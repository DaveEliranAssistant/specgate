const express = require('express');
const requireRole = require('../middleware/require-role');
const check = require('../middleware/check');
const itemRules = require('../rules/item.rules');
const itemController = require('../controllers/item.controller');

const router = express.Router();

router
  .route('/')
  .get(check(itemRules.list), itemController.list)
  .post(requireRole('editor'), check(itemRules.create), itemController.create);

router.get('/recent', itemController.list);

router
  .route('/:itemId')
  .get(check(itemRules.read), itemController.read)
  .delete(requireRole('editor'), itemController.remove);

module.exports = router;
