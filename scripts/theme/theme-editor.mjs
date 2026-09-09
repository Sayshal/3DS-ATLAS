import { MODULE } from '../constants.mjs';
import { COLOR_CATEGORIES, COLOR_DEFINITIONS } from './presets.mjs';
import { getColorsForTheme, getCustomThemes, updateCustomTheme } from './theme-engine.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Standalone color editor for a single custom theme. Applies every change live. */
export default class ThemeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} The custom theme key being edited. */
  #key;

  /**
   * @param {object} options            Application options.
   * @param {string} options.themeKey   Custom theme key to edit.
   */
  constructor(options = {}) {
    super(options);
    this.#key = options.themeKey;
  }

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'atlas-theme-editor',
    tag: 'form',
    classes: ['atlas', 'atlas-theme-editor'],
    window: { title: 'ATLAS.Theme.EditorTitle', icon: 'fas fa-palette', contentClasses: ['standard-form'] },
    position: { width: 460, height: 'auto' },
    actions: { save: ThemeEditor.#onSave }
  };

  /** @inheritdoc */
  static PARTS = {
    main: { template: `modules/${MODULE.ID}/templates/theme-editor/main.hbs` },
    footer: { template: `modules/${MODULE.ID}/templates/theme-editor/footer.hbs` }
  };

  /** @inheritdoc */
  get title() {
    return `${_loc('ATLAS.Theme.EditorTitle')} — ${getCustomThemes()[this.#key]?.name ?? ''}`;
  }

  /** @inheritdoc */
  async _prepareContext() {
    const colors = getColorsForTheme(this.#key);
    const categories = {};
    for (const def of COLOR_DEFINITIONS) {
      (categories[def.category] ??= { label: COLOR_CATEGORIES[def.category], fields: [] }).fields.push({ key: def.key, label: _loc(def.label), value: colors[def.key] });
    }
    return { name: getCustomThemes()[this.#key]?.name ?? '', categories: Object.values(categories) };
  }

  /**
   * Persist every color and the name, apply the theme, and refresh the open Theme Config.
   * @this {ThemeEditor}
   * @returns {Promise<void>}
   */
  static async #onSave() {
    const colors = {};
    for (const picker of this.element.querySelectorAll('color-picker[data-key]')) colors[picker.dataset.key] = picker.value;
    const name = this.element.querySelector('input[name="customName"]')?.value;
    await updateCustomTheme(this.#key, colors, name);
    foundry.applications.instances.get('atlas-theme-config')?.render();
    ui.notifications.info('ATLAS.Theme.Saved');
  }
}
