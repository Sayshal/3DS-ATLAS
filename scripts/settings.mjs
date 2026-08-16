import { MODULE, SETTINGS } from './constants.mjs';
import DocsSearch from './docs-search.mjs';
import ThemeConfig from './theme/theme-config.mjs';
import { initializeThemes } from './theme/theme-engine.mjs';
import Troubleshooter from './troubleshooter.mjs';

const { BooleanField, ObjectField, StringField } = foundry.data.fields;

/** Registers and manages ATLAS game settings. */
export default class ATLASSettings {
  /**
   * Register all settings and the theme, troubleshooter, and docs search menus.
   * @returns {void}
   */
  static registerSettings() {
    game.settings.register(MODULE.ID, SETTINGS.LOGGING_LEVEL, {
      name: 'ATLAS.Settings.LoggingLevel.Name',
      hint: 'ATLAS.Settings.LoggingLevel.Hint',
      scope: 'client',
      config: true,
      type: new StringField({
        required: true,
        blank: false,
        initial: '2',
        choices: { 0: 'ATLAS.Settings.LoggingLevel.Off', 1: 'ATLAS.Settings.LoggingLevel.Errors', 2: 'ATLAS.Settings.LoggingLevel.Warnings', 3: 'ATLAS.Settings.LoggingLevel.Verbose' }
      })
    });
    game.settings.register(MODULE.ID, SETTINGS.UPDATE_NOTICES, {
      name: 'ATLAS.Settings.UpdateNotices.Name',
      hint: 'ATLAS.Settings.UpdateNotices.Hint',
      scope: 'world',
      config: true,
      type: new BooleanField({ initial: true })
    });
    game.settings.register(MODULE.ID, SETTINGS.CHANGELOGGER, {
      name: 'ATLAS.Settings.Changelogger.Name',
      hint: 'ATLAS.Settings.Changelogger.Hint',
      scope: 'world',
      config: true,
      type: new BooleanField({ initial: true })
    });
    game.settings.register(MODULE.ID, SETTINGS.MODULE_THEMES, { scope: 'client', config: false, type: new ObjectField({ initial: {} }) });
    game.settings.register(MODULE.ID, SETTINGS.FORCED_THEMES, { scope: 'world', config: false, type: new ObjectField({ initial: {} }), onChange: () => initializeThemes() });
    game.settings.register(MODULE.ID, SETTINGS.CUSTOM_THEMES, { scope: 'client', config: false, type: new ObjectField({ initial: {} }) });
    game.settings.register(MODULE.ID, SETTINGS.SEEN_VERSIONS, { scope: 'world', config: false, type: new ObjectField({ initial: {} }) });
    game.settings.register(MODULE.ID, SETTINGS.NOTIFIED_AVAILABLE, { scope: 'world', config: false, type: new ObjectField({ initial: {} }) });
    game.settings.registerMenu(MODULE.ID, 'themeConfig', {
      name: 'ATLAS.Theme.MenuName',
      label: 'ATLAS.Theme.MenuLabel',
      hint: 'ATLAS.Theme.MenuHint',
      icon: 'fas fa-palette',
      type: ThemeConfig,
      restricted: false
    });
    game.settings.registerMenu(MODULE.ID, 'troubleshooter', {
      name: 'ATLAS.Troubleshooter.MenuName',
      label: 'ATLAS.Troubleshooter.MenuLabel',
      hint: 'ATLAS.Troubleshooter.MenuHint',
      icon: 'fas fa-stethoscope',
      type: Troubleshooter,
      restricted: false
    });
    game.settings.registerMenu(MODULE.ID, 'docsSearch', {
      name: 'ATLAS.DocsSearch.MenuName',
      label: 'ATLAS.DocsSearch.MenuLabel',
      hint: 'ATLAS.DocsSearch.MenuHint',
      icon: 'fas fa-book-open',
      type: DocsSearch,
      restricted: false
    });
  }
}
