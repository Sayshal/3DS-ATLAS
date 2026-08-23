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

/**
 * The GM that executes suite automation.
 * @returns {object|null}
 */
export function getPrimaryGM() {
  const chosen = game.users.get(game.settings.get(MODULE.ID, SETTINGS.PRIMARY_GM));
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
