const isText = (v) => typeof v === 'string' && v.length > 0;

module.exports = {
  list: {},
  create: { body: { name: isText } },
  read: {},
};
