// Metro: Expo's defaults, plus the Wrapped engine read straight from packages/wrapped/src, so the app needs no
// workspace dependency and npm and pnpm installs resolve it the same way.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const wrapped = path.resolve(__dirname, '../wrapped');
const config = getDefaultConfig(__dirname);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), wrapped])];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, '@textrovert/wrapped': path.join(wrapped, 'src') };

module.exports = config;
