const check = (rules) => (req, res, next) => {
  for (const [field, test] of Object.entries(rules.body ?? {})) {
    if (!test(req.body?.[field])) {
      res.status(400).send({ message: field });
      return;
    }
  }
  next();
};

module.exports = check;
