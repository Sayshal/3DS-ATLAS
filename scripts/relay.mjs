import { MODULE, RELAY_CHANNEL } from './constants.mjs';
import { getModule } from './registry.mjs';
import { logAs } from './utils/logger.mjs';

/**
 * Find a module's allowlisted relay event declaration.
 * @param {string} moduleId  Sender module id
 * @param {string} event     Hook event name
 * @returns {object|undefined}
 */
function findEvent(moduleId, event) {
  return getModule(moduleId)?.events.find((declared) => declared.name === event);
}

/**
 * Whether this client is the single GM that executes GM-authoritative events.
 * @returns {boolean}
 */
function isPrimaryGM() {
  return game.users.activeGM?.isSelf === true;
}

/**
 * Re-fire a relayed hook locally with the remote marker appended.
 * @param {object} payload  Socket payload
 * @returns {void}
 */
function refire(payload) {
  Hooks.callAll(payload.event, ...payload.args, { remote: true, userId: payload.userId });
}

/**
 * Handle an incoming relay message.
 * @param {object} payload  Socket payload
 * @returns {void}
 */
function onMessage(payload) {
  if (!payload?.event) return;
  const declared = findEvent(payload.moduleId, payload.event);
  if (!declared) return logAs(MODULE.TITLE, 2, `Relay rejected "${payload.event}" from "${payload.moduleId}": not in its registered allowlist.`);
  if (declared.gmAuthoritative && !payload.relayed) {
    if (!isPrimaryGM()) return;
    refire(payload);
    game.socket.emit(RELAY_CHANNEL, { ...payload, relayed: true });
    return;
  }
  refire(payload);
}

/**
 * Broadcast an allowlisted hook event to every other client. The sender is
 * responsible for firing the hook locally; relayed fires carry `{remote: true, userId}`.
 * @param {string} moduleId  Sender module id
 * @param {string} event     Hook event name
 * @param {...*} args        Hook arguments; must survive socket serialization
 * @returns {void}
 */
export function broadcast(moduleId, event, ...args) {
  const title = getModule(moduleId)?.title ?? moduleId;
  const declared = findEvent(moduleId, event);
  if (!declared) return logAs(title, 2, `Cannot relay "${event}": not in this module's registered allowlist.`);
  const payload = { moduleId, event, args, userId: game.user.id };
  if (!declared.gmAuthoritative) return game.socket.emit(RELAY_CHANNEL, payload);
  if (!game.users.activeGM) return logAs(title, 2, `Cannot relay "${event}": no active GM to execute it.`);
  game.socket.emit(RELAY_CHANNEL, isPrimaryGM() ? { ...payload, relayed: true } : payload);
}

/**
 * Attach the relay socket listener.
 * @returns {void}
 */
export function initializeRelay() {
  game.socket.on(RELAY_CHANNEL, onMessage);
}
