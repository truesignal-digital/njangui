const path = require('path');
const connect = require('connect');
const { simMiddleware } = require('serve-sim/middleware');
// Sentry wraps expo/metro-config's getDefaultConfig to hook sourcemap upload.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const bufferPackageRoot = path.dirname(
  require.resolve('buffer/package.json', { paths: [projectRoot] })
);

const config = getSentryExpoConfig(projectRoot);

// Standalone repo (no monorepo workspace) — only the project root is watched.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  buffer: bufferPackageRoot,
};

config.server = config.server || {};
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const middleware = originalEnhanceMiddleware
    ? originalEnhanceMiddleware(metroMiddleware, server)
    : metroMiddleware;

  const app = connect();
  app.use(simMiddleware({ basePath: '/.sim' }));
  app.use(middleware);
  return app;
};

module.exports = withNativeWind(config, { input: './global.css' });
