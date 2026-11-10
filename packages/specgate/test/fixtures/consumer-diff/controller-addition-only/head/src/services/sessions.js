const open = async (user) => ({ user });
const close = async () => undefined;

const renew = async (token) => ({ token });

module.exports = { open, close, renew };
