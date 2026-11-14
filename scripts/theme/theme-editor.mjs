import { MODULE } from '../constants.mjs';
import { COLOR_CATEGORIES, COLOR_DEFINITIONS, contrastRatio, cssVar } from './presets.mjs';
import { getColorsForTheme, getCustomThemes, themeDeclarations, updateCustomTheme } from './theme-engine.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {Array<Array<string|number>>} Foreground key, background key, and minimum WCAG ratio for each contrast check. */
const CONTRAST_CHECKS = [
  ['text', 'bg', 4.5],
  ['text', 'bgLighter', 4.5],
  ['textSecondary', 'bg', 4.5],
  ['textDim', 'bg', 4.5],
  ['textDim', 'bgLighter', 4.5],
  ['titleText', 'bg', 4.5],
  ['buttonText', 'buttonBg', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['calloutText', 'bg', 4.5],
  ['primary', 'bg', 3],
  ['accent', 'bgLighter', 3],
  ['error', 'bg', 3],
  ['warning', 'bg', 3],
  ['success', 'bg', 3]
];

/** Two-pane editor for a single custom theme: color controls beside a live preview, saved as each color is committed. */
export default class ThemeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} The custom theme key being edited. */
  #key;

  /** @type {{colors: Object<string, string>, name: string}} Theme state when the editor opened, for Reset. */
  #original;

  /**
   * @param {object} options            Application options.
   * @param {string} options.themeKey   Custom theme key to edit.
   */
  constructor(options = {}) {
    super(options);
    this.#key = options.themeKey;
    this.#original = { colors: getColorsForTheme(this.#key), name: getCustomThemes()[this.#key]?.name ?? '' };
  }

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'atlas-theme-editor',
    tag: 'form',
    classes: ['atlas', 'atlas-theme-editor'],
    window: { title: 'ATLAS.Theme.EditorTitle', icon: 'fas fa-palette', resizable: true },
    position: { width: 1200, height: 'auto' },
    actions: { reset: ThemeEditor.#onReset }
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
    const labels = {};
    for (const def of COLOR_DEFINITIONS) {
      labels[def.key] = _loc(def.label);
      (categories[def.category] ??= { label: COLOR_CATEGORIES[def.category], fields: [] }).fields.push({ key: def.key, label: labels[def.key], value: colors[def.key] });
    }
    const checks = CONTRAST_CHECKS.map(([fg, bg]) => (fg === 'onPrimary' ? labels.primary : `${labels[fg]} / ${labels[bg]}`));
    return { name: getCustomThemes()[this.#key]?.name ?? '', categories: Object.values(categories), labels, checks };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#refreshPreview();
  }

  /** @inheritdoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener('input', (event) => {
      const picker = event.target.closest('color-picker');
      if (picker && !/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
      if (event.target.type === 'color') picker.querySelector('input[type="text"]').value = event.target.value;
      this.#refreshPreview();
    });
    this.element.addEventListener('change', () => updateCustomTheme(this.#key, this.#readColors(), this.#readName()));
  }

  /**
   * Read the current color of every picker, including an in-progress drag.
   * @returns {Object<string, string>}
   */
  #readColors() {
    const colors = {};
    for (const picker of this.element.querySelectorAll('color-picker[data-key]')) colors[picker.dataset.key] = picker.querySelector('input[type="color"]').value;
    return colors;
  }

  /**
   * Read the theme name field.
   * @returns {string}
   */
  #readName() {
    return this.element.querySelector('input[name="customName"]')?.value.trim();
  }

  /**
   * Push the current colors into the preview pane and recompute the contrast checks.
   * @returns {void}
   */
  #refreshPreview() {
    const colors = this.#readColors();
    const declarations = themeDeclarations(colors);
    const preview = this.element.querySelector('.atlas-editor-preview');
    for (const [name, value] of declarations) preview.style.setProperty(name, value);
    preview.querySelector('.atlas-pv-head span').textContent = this.#readName();
    const swatches = { ...colors, onPrimary: Object.fromEntries(declarations)[cssVar('textOnColor')] };
    for (const row of this.element.querySelectorAll('[data-check]')) {
      const [fg, bg, min] = CONTRAST_CHECKS[row.dataset.check];
      const ratio = contrastRatio(swatches[fg], swatches[bg]);
      const fail = ratio < min;
      row.querySelector('.atlas-check-sample').style.cssText = `color: ${swatches[fg]}; background: ${swatches[bg]}`;
      row.querySelector('.atlas-check-ratio').textContent = `${ratio.toFixed(1)}:1`;
      row.querySelector('i').className = fail ? 'fas fa-triangle-exclamation' : 'fas fa-circle-check';
      row.classList.toggle('fail', fail);
    }
  }

  /**
   * Restore the colors and name the theme had when the editor opened.
   * @this {ThemeEditor}
   * @returns {Promise<void>}
   */
  static async #onReset() {
    await updateCustomTheme(this.#key, this.#original.colors, this.#original.name);
    await this.render();
  }

  /** @inheritdoc */
  async _preClose(options) {
    await super._preClose(options);
    foundry.applications.instances.get('atlas-theme-config')?.render();
  }
}
