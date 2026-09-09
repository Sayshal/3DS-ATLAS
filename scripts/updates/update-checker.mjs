import { MODULE, SETTINGS } from '../constants.mjs';
import { getRegisteredModules } from '../registry.mjs';
import UpdateNotice from './update-notice.mjs';

/** Central 3DS module version map. */
const VERSIONS_URL = 'https://www.3deathsaves.com/versions.json';

/**
 * Read a module's bundled release notes.
 * @param {string} moduleId  Registered module id.
 * @returns {Promise<string>}
 */
async function fetchReleaseNotes(moduleId) {
  try {
    const res = await fetch(`modules/${moduleId}/release_notes.txt`);
    return res.ok ? (await res.text()).trim() : '';
  } catch {
    return '';
  }
}

/**
 * Read the central module version map.
 * @returns {Promise<Object<string, string>>}
 */
async function fetchLatestVersions() {
  try {
    const res = await fetch(VERSIONS_URL);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

/**
 * Whisper the GM a chat list of modules with a newer version available.
 * @param {{title: string, version: string, url: ?string}[]} pending  Available updates.
 * @returns {Promise<void>}
 */
async function postAvailableChat(pending) {
  const items = pending.map((p) => `<li>${p.url ? `<a href="${p.url}">${p.title} ${p.version}</a>` : `${p.title} ${p.version}`}</li>`).join('');
  const content = `<div class="atlas-update-notice"><h3>${_loc('ATLAS.Update.PendingTitle')}</h3><ul class="atlas-update-list">${items}</ul></div>`;
  await ChatMessage.create({ content, whisper: [game.user.id], speaker: { alias: MODULE.TITLE } });
}

/**
 * Check every registered module.
 * @returns {Promise<void>}
 */
export async function checkForUpdates() {
  if (!game.user.isGM) return;
  const wantChat = game.settings.get(MODULE.ID, SETTINGS.UPDATE_NOTICES);
  const wantLog = game.settings.get(MODULE.ID, SETTINGS.CHANGELOGGER);
  if (!wantChat && !wantLog) return;
  const seen = game.settings.get(MODULE.ID, SETTINGS.SEEN_VERSIONS) || {};
  const notified = game.settings.get(MODULE.ID, SETTINGS.NOTIFIED_AVAILABLE) || {};
  const latest = wantChat ? await fetchLatestVersions() : {};
  const changed = [];
  const pending = [];
  let dirty = false;
  let notifiedDirty = false;
  for (const entry of getRegisteredModules().values()) {
    const mod = game.modules.get(entry.id);
    const installed = mod?.version;
    if (!installed) continue;
    if (wantLog && seen[entry.id] && seen[entry.id] !== installed) changed.push({ id: entry.id, title: entry.title, version: installed, notes: await fetchReleaseNotes(entry.id) });
    if (seen[entry.id] !== installed) {
      seen[entry.id] = installed;
      dirty = true;
    }
    const remote = latest[entry.id];
    if (wantChat && remote && foundry.utils.isNewerVersion(remote, installed) && notified[entry.id] !== remote) {
      const url = mod.protected ? `https://foundryvtt.com/packages/${entry.id}` : mod.url;
      pending.push({ title: entry.title, version: remote, url });
      notified[entry.id] = remote;
      notifiedDirty = true;
    }
  }
  if (changed.length) new UpdateNotice({ changed }).render(true);
  if (pending.length) await postAvailableChat(pending);
  if (dirty) await game.settings.set(MODULE.ID, SETTINGS.SEEN_VERSIONS, seen);
  if (notifiedDirty) await game.settings.set(MODULE.ID, SETTINGS.NOTIFIED_AVAILABLE, notified);
}
