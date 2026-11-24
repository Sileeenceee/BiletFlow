// The interface text is shared with the website: src/i18n.tsx imports
// ../frontend/src/lib/messages.ts, so Metro has to watch that folder too.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.watchFolders = [path.resolve(__dirname, '../frontend/src/lib')]

module.exports = config
