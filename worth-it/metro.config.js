const { getDefaultConfig } = require('expo/metro-config');
const { productImportMiddleware } = require('./server/product-import.cjs');

const config = getDefaultConfig(__dirname);
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, metroServer) => {
  const nextMiddleware = enhance ? enhance(metroMiddleware, metroServer) : metroMiddleware;
  return (req, res, next) => productImportMiddleware(req, res, () => nextMiddleware(req, res, next));
};
module.exports = config;
