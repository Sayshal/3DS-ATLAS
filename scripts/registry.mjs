import { HOOKS } from './constants.mjs';
import { reportToMarkdown } from './diagnostics.mjs';
import { broadcast } from './relay.mjs';
import { applyModuleTheme, setModuleTheme } from './theme/theme-engine.mjs';
import { logAs } from './utils/logger.mjs';

/** @type {Map<string, object>} Registered module id -> registration config. */
const registered = new Map();

/**
 * Register a 3DS module with ATLAS. Returns a handle bound to the module id.
 * @param {string} moduleId                 The consuming module's id
 * @param {object} [config]                 Registration options
 * @param {string} [config.title]           Human-readable module title
 * @param {string} [config.github]          "owner/repo" for update notices
 * @param {{scope: string}} [config.theme]  CSS selector its applications live under
 * @param {Function} [config.debug]         Callback returning extra troubleshooter lines
 * @param {object[]} [config.detachable]    Detachable `{id, label}` apps; labels are loc keys
 * @param {(string|object)[]} [config.events]  Hook events this module may relay; `{name, gmAuthoritative}` or a bare name
 * @returns {object}
 */
export function register(moduleId, config = {}) {
  const title = config.title || game.modules.get(moduleId)?.title || moduleId;
  const entry = {
    id: moduleId,
    title,
    github: config.github ?? null,
    theme: config.theme ?? null,
    debug: config.debug ?? null,
    detachable: (config.detachable ?? []).map((app) => ({ id: app.id, label: _loc(app.label || app.id) })),
    events: (config.events ?? []).map((event) => (typeof event === 'string' ? { name: event, gmAuthoritative: false } : { name: event.name, gmAuthoritative: !!event.gmAuthoritative }))
  };
  registered.set(moduleId, entry);
  Hooks.callAll(HOOKS.REGISTERED, entry);
  return buildHandle(entry);
}

/**
 * Look up a registered module entry.
 * @param {string} moduleId  Module id
 * @returns {object|undefined}
 */
export function getModule(moduleId) {
  return registered.get(moduleId);
}

/**
 * The full registry map.
 * @returns {Map<string, object>}
 */
export function getRegisteredModules() {
  return registered;
}

/**
 * Build the scoped handle returned from register().
 * @param {object} entry  Registration entry
 * @returns {object}
 */
function buildHandle(entry) {
  return {
    id: entry.id,
    title: entry.title,
    /**
     * Log under this module's prefix, gated by the shared ATLAS log level.
     * @param {number} level  1=error, 2=warning, 3=verbose
     * @param {...*} args     Content to log
     */
    log: (level, ...args) => logAs(entry.title, level, ...args),
    theme: {
      /**
       * Set and persist this module's module-wide theme.
       * @param {string} key  Theme key
       * @returns {Promise<void>}
       */
      set: (key) => setModuleTheme(entry.id, key),
      /**
       * Set and persist a per-application theme override.
       * @param {string} appKey  Sub-application key (as registered in theme.apps)
       * @param {string} key     Theme key
       * @returns {Promise<void>}
       */
      setApp: (appKey, key) => setModuleTheme(entry.id, key, appKey),
      /**
       * Re-apply this module's saved themes now (e.g. after opening an app).
       * @returns {void}
       */
      refresh: () => applyModuleTheme(entry.id)
    },
    /**
     * Re-fire one of this module's registered events on every other client.
     * @param {string} event  Hook event name, as declared in config.events
     * @param {...*} args     Hook arguments; must survive socket serialization
     * @returns {void}
     */
    broadcast: (event, ...args) => broadcast(entry.id, event, ...args),
    /**
     * Get the shared diagnostics report as markdown for this module's issue templates.
     * @returns {string}
     */
    report: () => reportToMarkdown()
  };
}
