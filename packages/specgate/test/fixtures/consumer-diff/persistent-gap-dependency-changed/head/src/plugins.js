const load = () => (req, res, next) => { res.set('x-plugin', '1'); next(); };

module.exports = { load };
