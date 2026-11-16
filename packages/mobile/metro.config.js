// Metro: Expo's defaults, plus the Wrapped engine from vendor/wrapped, a copy of packages/wrapped/src that
// scripts/vendor-wrapped.js refreshes, so the app builds from this folder alone.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, '@textrovert/wrapped': path.join(__dirname, 'vendor/wrapped') };

module.exports = config;
