import { MODULE } from '../constants.mjs';
import { getRegisteredModules } from '../registry.mjs';
import { THEME_PRESETS } from './presets.mjs';
import ThemeEditor from './theme-editor.mjs';
import {
  createCustomTheme,
  deleteCustomTheme,
  exportCustomTheme,
  getAppScopes,
  getColorsForTheme,
  getCustomThemes,
  getForcedTheme,
  getModuleThemes,
  importCustomTheme,
  setForcedTheme,
  setModuleTheme
} from './theme-engine.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Per-module (and per-application) theme picker plus a custom-theme editor with
 * import/export. Assigns a preset or custom theme to each registered module and, where a
 * module registers sub-applications, to each of those individually.
 */
export default class ThemeConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'atlas-theme-config',
    tag: 'form',
    classes: ['atlas', 'atlas-theme-config'],
    window: { title: 'ATLAS.Theme.Title', icon: 'fas fa-palette', contentClasses: ['standard-form'] },
    position: { width: 620, height: 'auto' },
    actions: {
      createCustom: ThemeConfig.#onCreateCustom,
      editCustom: ThemeConfig.#onEditCustom,
      deleteCustom: ThemeConfig.#onDeleteCustom,
      exportCustom: ThemeConfig.#onExportCustom,
      importCustom: ThemeConfig.#onImportCustom
    }
  };

  static PARTS = {
    modules: { template: `modules/${MODULE.ID}/templates/theme-config/modules.hbs` },
    custom: { template: `modules/${MODULE.ID}/templates/theme-config/custom.hbs` }
  };

  /** @inheritdoc */
  async _prepareContext() {
    const selections = getModuleThemes();
    const customThemes = getCustomThemes();
    const byName = (a, b) => a.name.localeCompare(b.name);
    const presetChoices = Object.entries(THEME_PRESETS)
      .map(([key, p]) => ({ key, name: _loc(p.name) }))
      .sort(byName);
    const customChoices = Object.entries(customThemes)
      .map(([key, c]) => ({ key, name: c.name }))
      .sort(byName);

    /**
     * Build a <select>'s option groups with the selected flag precomputed.
     * @param {string} selected      Currently-selected key
     * @param {string} defaultLabel  Label for the "inherit/default" option
     * @returns {object}
     */
    const buildSelect = (selected, defaultLabel) => ({
      defaultLabel,
      isDefault: !selected || selected === 'none',
      groups: [
        { group: 'ATLAS.Common.Presets', choices: presetChoices.map((c) => ({ ...c, selected: c.key === selected })) },
        { group: 'ATLAS.Common.Custom', choices: customChoices.map((c) => ({ ...c, selected: c.key === selected })) }
      ]
    });

    const modules = [];
    for (const entry of getRegisteredModules().values()) {
      if (!entry.theme?.scope) continue;
      const sel = selections[entry.id] || {};
      const moduleWide = sel.theme || 'none';
      const apps = getAppScopes(entry.theme).map((app) => ({ key: app.key, label: app.label, select: buildSelect(sel.apps?.[app.key] || 'none', 'ATLAS.Common.Inherit') }));
      modules.push({
        id: entry.id,
        title: entry.title,
        swatch: moduleWide === 'none' ? null : getColorsForTheme(moduleWide).bg,
        select: buildSelect(moduleWide, 'ATLAS.Common.Default'),
        forced: !!getForcedTheme(entry.id),
        apps
      });
    }
    const allSelect = buildSelect('none', 'ATLAS.Theme.AllPlaceholder');
    return { isGM: game.user.isGM, modules, allSelect, customThemes: customChoices, presetChoices };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('select[data-all]')?.addEventListener('change', async (event) => {
      const key = event.target.value;
      for (const entry of getRegisteredModules().values()) {
        if (!entry.theme?.scope) continue;
        await setModuleTheme(entry.id, key);
        for (const app of getAppScopes(entry.theme)) await setModuleTheme(entry.id, key, app.key);
        if (game.user.isGM && getForcedTheme(entry.id)) await setForcedTheme(entry.id, key);
      }
      this.render();
    });
    for (const select of this.element.querySelectorAll('select[data-module]')) {
      select.addEventListener('change', async (event) => {
        const el = event.target;
        await setModuleTheme(el.dataset.module, el.value, el.dataset.app || undefined);
        if (!el.dataset.app && game.user.isGM) {
          const box = this.element.querySelector(`input[data-force="${el.dataset.module}"]`);
          if (box?.checked) await setForcedTheme(el.dataset.module, el.value);
        }
        this.render();
      });
    }
    for (const box of this.element.querySelectorAll('input[data-force]')) {
      box.addEventListener('change', async (event) => {
        const el = event.target;
        const select = this.element.querySelector(`select[data-module="${el.dataset.force}"]:not([data-app])`);
        await setForcedTheme(el.dataset.force, el.checked ? select?.value : null);
        this.render();
      });
    }
  }

  /**
   * Create a custom theme from the chosen base preset and open it in the editor window.
   * @param {Event} _event        Originating click
   * @param {HTMLElement} target  Action target
   * @returns {Promise<void>}
   */
  static async #onCreateCustom(_event, target) {
    const base = target.closest('form').querySelector('select[name="basePreset"]')?.value || 'dark';
    const key = await createCustomTheme(base);
    this.render();
    ThemeConfig.#openEditor(key);
  }

  /**
   * Open an existing custom theme in the editor window.
   * @param {Event} _event        Originating click
   * @param {HTMLElement} target  Action target
   * @returns {void}
   */
  static #onEditCustom(_event, target) {
    ThemeConfig.#openEditor(target.dataset.key);
  }

  /**
   * Open (replacing any current) the standalone theme editor for a custom theme.
   * @param {string} key  Custom theme key.
   * @returns {void}
   */
  static #openEditor(key) {
    foundry.applications.instances.get('atlas-theme-editor')?.close();
    new ThemeEditor({ themeKey: key }).render(true);
  }

  /**
   * Delete a custom theme.
   * @param {Event} _event        Originating click
   * @param {HTMLElement} target  Action target
   * @returns {Promise<void>}
   */
  static async #onDeleteCustom(_event, target) {
    await deleteCustomTheme(target.dataset.key);
    this.render();
  }

  /**
   * Download a custom theme as a JSON file.
   * @param {Event} _event        Originating click
   * @param {HTMLElement} target  Action target
   * @returns {void}
   */
  static #onExportCustom(_event, target) {
    const json = exportCustomTheme(target.dataset.key);
    if (json) foundry.utils.saveDataToFile(json, 'application/json', `atlas-theme-${target.dataset.key}.json`);
  }

  /**
   * Import a custom theme from a chosen JSON file.
   * @returns {Promise<void>}
   */
  static async #onImportCustom() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const key = await importCustomTheme(await file.text());
      if (!key) ui.notifications.error('ATLAS.Theme.ImportFailed');
      this.render();
      if (key) ThemeConfig.#openEditor(key);
    });
    input.click();
  }
}
