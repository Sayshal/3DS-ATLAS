import { MODULE, SETTINGS } from './constants.mjs';
import { getRegisteredModules } from './registry.mjs';
import { log } from './utils/logger.mjs';

/** @type {number} Payload shape version, bumped when the export format changes incompatibly. */
const FORMAT_VERSION = 1;

/** @type {Object<string, string[]>} Volatile keys never worth carrying between worlds, by module id. */
const EXCLUDED_KEYS = {
  [MODULE.ID]: [SETTINGS.SEEN_VERSIONS, SETTINGS.NOTIFIED_AVAILABLE, SETTINGS.PRIMARY_GM]
};

/**
 * Whether the current user may write a setting of this scope.
 * @param {string} scope  One of "client", "world", "user".
 * @returns {boolean}
 */
function canWriteScope(scope) {
  return scope !== 'world' || game.user.can('SETTINGS_MODIFY');
}

/**
 * Sweep every registered setting in a module's namespace, minus its excluded keys.
 * @param {string} moduleId  Namespace to read.
 * @returns {Object<string, *>} Setting key to value.
 */
function sweepNamespace(moduleId) {
  const excluded = new Set(EXCLUDED_KEYS[moduleId] ?? []);
  const out = {};
  for (const [, setting] of game.settings.settings) {
    if (setting.namespace !== moduleId || excluded.has(setting.key)) continue;
    out[setting.key] = game.settings.get(moduleId, setting.key);
  }
  return out;
}

/**
 * Build a transfer payload for the given registered modules.
 * @param {string[]} moduleIds  Registered module ids to include.
 * @returns {object} The transfer payload.
 */
export function buildPayload(moduleIds) {
  const registry = getRegisteredModules();
  const modules = {};
  for (const id of moduleIds) {
    const entry = registry.get(id);
    if (!entry) continue;
    const settings = entry.settingsIO?.export ? entry.settingsIO.export() : sweepNamespace(id);
    modules[id] = { version: game.modules.get(id)?.version ?? null, settings };
  }
  return { formatVersion: FORMAT_VERSION, atlasVersion: game.modules.get(MODULE.ID)?.version ?? null, exportedAt: new Date().toISOString(), modules };
}

/**
 * Export the chosen modules' settings and hand the user a JSON file.
 * @param {string[]} moduleIds  Registered module ids to include.
 * @returns {object} The payload that was written.
 */
export function exportSuite(moduleIds) {
  const payload = buildPayload(moduleIds);
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), 'application/json', `atlas-settings-${new Date().toISOString().slice(0, 10)}.json`);
  return payload;
}

/**
 * Apply a transfer payload, skipping modules that are not registered and settings the user may not write.
 * @param {object} payload      A payload produced by `exportSuite`.
 * @param {string[]} moduleIds  Registered module ids to apply; others in the payload are ignored.
 * @returns {Promise<{applied: number, skipped: string[], failed: string[]}>} What landed.
 */
export async function importSuite(payload, moduleIds) {
  if (payload?.formatVersion !== FORMAT_VERSION) throw new Error(`Unsupported settings payload version: ${payload?.formatVersion}`);
  const registry = getRegisteredModules();
  const wanted = new Set(moduleIds);
  const result = { applied: 0, skipped: [], failed: [] };
  let reloadWorld = false;
  let reloadClient = false;
  for (const [id, block] of Object.entries(payload.modules ?? {})) {
    const entry = registry.get(id);
    if (!entry || !wanted.has(id)) continue;
    if (entry.settingsIO?.import) {
      await entry.settingsIO.import(block);
      result.applied++;
      continue;
    }
    for (const [key, value] of Object.entries(block.settings ?? {})) {
      const config = game.settings.settings.get(`${id}.${key}`);
      if (!config) {
        result.skipped.push(`${id}.${key}`);
        continue;
      }
      if (!canWriteScope(config.scope)) {
        result.skipped.push(`${id}.${key}`);
        continue;
      }
      try {
        await game.settings.set(id, key, value);
        result.applied++;
        if (config.requiresReload) config.scope === 'client' ? (reloadClient = true) : (reloadWorld = true);
      } catch (error) {
        result.failed.push(`${id}.${key}`);
        log(1, `Settings import failed for ${id}.${key}`, error);
      }
    }
  }
  if (reloadWorld || reloadClient) await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: reloadWorld });
  return result;
}
