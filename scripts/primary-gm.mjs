import { MODULE, SETTINGS } from './constants.mjs';

/**
 * Choices for the primary GM setting: every GM user, plus the automatic option.
 * @returns {object}
 */
export function gmChoices() {
  const choices = { '': 'ATLAS.Settings.PrimaryGM.Automatic' };
  for (const user of game.users.filter((user) => user.isGM)) choices[user.id] = user.name;
  return choices;
}

/** @type {string|undefined} Chosen primary GM user id, read once and cleared when the setting changes. */
let chosenId;

/** Forget the cached primary GM choice after the setting changes. */
export function resetPrimaryGM() {
  chosenId = undefined;
}

/**
 * The GM that executes suite automation.
 * @returns {object|null}
 */
export function getPrimaryGM() {
  chosenId ??= game.settings.get(MODULE.ID, SETTINGS.PRIMARY_GM);
  const chosen = game.users.get(chosenId);
  if (chosen?.active && chosen.isGM) return chosen;
  return game.users.activeGM ?? null;
}

/**
 * Whether this client is the GM that executes suite automation.
 * @returns {boolean}
 */
export function isPrimaryGM() {
  return getPrimaryGM()?.isSelf === true;
}
