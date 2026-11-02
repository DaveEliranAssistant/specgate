// SYNTHETIC unsupported patterns.
// Discovery must report these and must not invent routes from them.

const method = 'get';
const id = '1';

app[method]('/computed-method', healthHandler);
app.get(`/tickets/${id}`, healthHandler);
app.post(pathFromConfig(), healthHandler);
app.delete('/ok' + '/joined', healthHandler);
app.get('/inline', (req, res) => {
  res.status(200).json({ ok: true });
});
app.route('/chained').get(healthHandler);

function pathFromConfig() {
  return '/nope';
}

function nested() {
  const route = '/inside';
  app.get(route, healthHandler);
  app.get('/literal-but-nested', healthHandler);
}
