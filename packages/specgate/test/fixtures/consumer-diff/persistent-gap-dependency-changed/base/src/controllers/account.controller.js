const sessions = require('../services/sessions');

const signIn = async (req, res) => {
  const token = await sessions.open(req.body.user, req.body.secret);
  res.send({ token });
};

const signOut = async (req, res) => {
  await sessions.close(req.body.token);
  res.status(204).send();
};

module.exports = { signIn, signOut };
