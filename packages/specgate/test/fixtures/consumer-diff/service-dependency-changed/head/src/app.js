const express = require('express');
const routes = require('./routes');
const { notFound, onError } = require('./middleware/errors');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(notFound);
app.use(onError);

module.exports = app;
