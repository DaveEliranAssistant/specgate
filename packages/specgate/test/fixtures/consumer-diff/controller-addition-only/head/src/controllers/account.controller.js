const sessions = require('../services/sessions');

const signIn = async (req, res) => {
  const token = await sessions.open(req.body.user, req.body.secret);
  res.send({ token });
};

const signOut = async (req, res) => {
  await sessions.close(req.body.token);
  res.status(204).send();
};

const refresh = async (req, res) => {
  res.send(await sessions.renew(req.body.token));
};

module.exports = { signIn, signOut, refresh };
