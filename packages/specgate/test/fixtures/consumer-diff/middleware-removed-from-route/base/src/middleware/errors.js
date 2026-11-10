const notFound = (req, res) => {
  res.status(404).send({ message: 'not found' });
};

const onError = (err, req, res, next) => {
  res.status(err.status || 500).send({ message: 'error' });
};

module.exports = { notFound, onError };
