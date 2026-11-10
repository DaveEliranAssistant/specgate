const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    res.status(403).send({ message: 'forbidden' });
    return;
  }
  next();
};

module.exports = requireRole;
