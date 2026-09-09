import { MODULE } from './constants.mjs';
import { getRegisteredModules } from './registry.mjs';
import { exportSuite, importSuite } from './settings-io.mjs';
import { log } from './utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Export and import settings across every registered 3DS module in one pass. */
export default class SettingsTransfer extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'atlas-settings-io',
    tag: 'form',
    classes: ['atlas', 'atlas-settings-io'],
    window: { title: 'ATLAS.SettingsIO.Title', icon: 'fas fa-file-import', contentClasses: ['standard-form'] },
    position: { width: 480, height: 'auto' },
    actions: {
      exportSelected: SettingsTransfer.#onExport,
      importSelected: SettingsTransfer.#onImport
    }
  };

  /** @inheritdoc */
  static PARTS = {
    body: { template: `modules/${MODULE.ID}/templates/settings-io/body.hbs` },
    footer: { template: `modules/${MODULE.ID}/templates/settings-io/footer.hbs` }
  };

  /** @inheritdoc */
  async _prepareContext() {
    const modules = [...getRegisteredModules().values()]
      .map((entry) => ({ id: entry.id, title: entry.title, active: game.modules.get(entry.id)?.active !== false }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { modules, isGM: game.user.isGM };
  }

  /**
   * The module ids currently ticked in the form.
   * @returns {string[]} Selected module ids.
   */
  #selectedIds() {
    return [...this.element.querySelectorAll('input[data-module-id]:checked')].map((input) => input.dataset.moduleId);
  }

  /**
   * Write the ticked modules' settings to a JSON file.
   * @returns {void}
   */
  static #onExport() {
    const ids = this.#selectedIds();
    if (!ids.length) return void ui.notifications.warn('ATLAS.SettingsIO.NothingSelected', { localize: true });
    exportSuite(ids);
  }

  /**
   * Read a JSON file and apply it to the ticked modules.
   * @returns {void}
   */
  static #onImport() {
    const ids = this.#selectedIds();
    if (!ids.length) return void ui.notifications.warn('ATLAS.SettingsIO.NothingSelected', { localize: true });
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      let result;
      try {
        result = await importSuite(JSON.parse(await file.text()), ids);
      } catch (error) {
        log(1, 'Settings import failed', error);
        return void ui.notifications.error('ATLAS.SettingsIO.InvalidFile', { localize: true });
      }
      ui.notifications.info(_loc('ATLAS.SettingsIO.Imported', { applied: result.applied, skipped: result.skipped.length + result.failed.length }));
    });
    input.click();
  }
}
