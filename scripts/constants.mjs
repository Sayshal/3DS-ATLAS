/** @type {object} Module identification */
export const MODULE = {
  ID: '3ds-atlas',
  LOG_LEVEL: 0,
  TITLE: '3DS:ATLAS'
};

/** @enum {string} Settings keys for Foundry VTT game settings */
export const SETTINGS = {
  LOGGING_LEVEL: 'loggingLevel',
  MODULE_THEMES: 'moduleThemes',
  FORCED_THEMES: 'forcedThemes',
  CUSTOM_THEMES: 'customThemes',
  UPDATE_NOTICES: 'updateNotices',
  CHANGELOGGER: 'changelogger',
  SEEN_VERSIONS: 'seenVersions',
  NOTIFIED_AVAILABLE: 'notifiedAvailable'
};

/** @enum {string} Custom hook event names dispatched by ATLAS */
export const HOOKS = {
  READY: `${MODULE.ID}.ready`,
  REGISTERED: `${MODULE.ID}.moduleRegistered`,
  THEME_CHANGED: `${MODULE.ID}.themeChanged`
};

/** @type {string} Socket channel used by the cross-client event relay. */
export const RELAY_CHANNEL = `module.${MODULE.ID}`;

/** @type {string} DOM id prefix + CSS var namespace shared by every consuming module. */
export const CSS_NAMESPACE = 'atlas';
