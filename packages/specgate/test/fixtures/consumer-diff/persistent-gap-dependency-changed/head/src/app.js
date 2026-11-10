const express = require('express');
const routes = require('./routes');
const { notFound, onError } = require('./middleware/errors');

const app = express();
app.use(express.json());
const pluginName = 'load';
app.use(require('./plugins')[pluginName]());
app.use('/api', routes);
app.use(notFound);
app.use(onError);

module.exports = app;
