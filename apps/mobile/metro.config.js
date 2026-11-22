// Expo's bundler, told about packages/shared: the brand, the themes and the layout this app
// shares with the dashboard. Imported as "@shared/brand" and so on (tsconfig.json's paths,
// which Expo reads). Metro only reads files inside the app unless it is told to watch more,
// so without watchFolders the import fails with "Unable to resolve module".
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "..", "..", "packages", "shared");

config.watchFolders = [...(config.watchFolders ?? []), shared];

module.exports = config;
