const rows = new Map();

const findAll = async () => [...rows.values()];
const findOne = async (id) => rows.get(String(id)) ?? null;
const insert = async (item) => { rows.set(item.id, item); return item; };
const drop = async (id) => { rows.delete(id); };

module.exports = { findAll, findOne, insert, drop };
