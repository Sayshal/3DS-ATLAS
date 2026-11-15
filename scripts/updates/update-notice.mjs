import { MODULE } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Renders release-notes markdown to HTML, falling back to escaped text.
 * @param {string} text  Raw markdown.
 * @returns {string} HTML string.
 */
function renderMarkdown(text) {
  if (!text) return '';
  if (globalThis.showdown) return new showdown.Converter({ simpleLineBreaks: true }).makeHtml(text);
  return `<pre>${foundry.utils.escapeHTML(text)}</pre>`;
}

/** Tabbed digest of newly-installed 3DS modules' release notes. */
export default class UpdateNotice extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {{id: string, title: string, version: string, notes: string}[]} */
  #changed;

  /** @type {string} Active tab key: a changed module id. */
  #active;

  /**
   * @param {object} options            Application options.
   * @param {object[]} options.changed  Newly-installed modules with release notes.
   */
  constructor(options = {}) {
    super(options);
    this.#changed = options.changed ?? [];
    this.#active = this.#changed[0]?.id;
  }

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'atlas-update-notice',
    classes: ['atlas', 'atlas-update-notice'],
    window: { title: 'ATLAS.Update.Title', icon: 'fas fa-bullhorn' },
    position: { width: 680, height: 'auto' }
  };

  /** @inheritdoc */
  static PARTS = {
    tabs: { template: `modules/${MODULE.ID}/templates/update-notice/tabs.hbs` },
    content: { template: `modules/${MODULE.ID}/templates/update-notice/content.hbs` }
  };

  /** @inheritdoc */
  async _prepareContext() {
    const tabs = this.#changed.map((c) => ({ key: c.id, label: `${c.title} ${c.version}`, active: c.id === this.#active }));
    const active = { notesHtml: renderMarkdown(this.#changed.find((c) => c.id === this.#active)?.notes) };
    return { tabs, active };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const tab of this.element.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => {
        this.#active = tab.dataset.tab;
        this.render();
      });
    }
  }
}
