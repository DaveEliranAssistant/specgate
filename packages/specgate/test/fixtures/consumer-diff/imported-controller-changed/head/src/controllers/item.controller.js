const store = require('../services/item.store');

const list = async (req, res) => {
  const items = await store.findAll(req.query);
  res.send({ items });
};

const create = async (req, res) => {
  const item = await store.insert(req.body);
  res.status(200).send(item);
};

const read = async (req, res) => {
  const item = await store.findOne(req.params.itemId);
  if (!item) {
    res.status(404).send({ message: 'missing' });
    return;
  }
  res.send(item);
};

const remove = async (req, res) => {
  await store.drop(req.params.itemId);
  res.status(204).send();
};

module.exports = { list, create, read, remove };
