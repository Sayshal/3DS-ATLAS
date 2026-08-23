import { MODULE } from './constants.mjs';
import { getRegisteredModules } from './registry.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {string} Public read-only wiki search endpoint. Omitting `q` serves the whole index. */
const WIKI_SEARCH_URL = 'https://www.3deathsaves.com/search';

/** Wiki documentation browser and search across every registered 3DS module. */
export default class DocsSearch extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} Module filter: `'all'` or a registered module id. */
  #scope = 'all';

  /** @type {?Array<{title: string, heading: ?string, module: string, moduleLabel: string, url: string}>} Whole wiki index, fetched once per open. */
  #entries = null;

  static DEFAULT_OPTIONS = {
    id: 'atlas-docs-search',
    classes: ['atlas', 'atlas-docs-search'],
    window: { title: 'ATLAS.DocsSearch.Title', icon: 'fas fa-book-open', resizable: true, contentClasses: ['standard-form'] },
    position: { width: 640, height: 'auto' }
  };

  static PARTS = { body: { template: `modules/${MODULE.ID}/templates/docs-search/body.hbs` } };

  /** @inheritdoc */
  async _prepareContext() {
    this.#entries ??= await DocsSearch.#fetchIndex();
    const options = [{ value: 'all', label: game.i18n.localize('ATLAS.DocsSearch.AllModules'), selected: this.#scope === 'all' }];
    for (const entry of getRegisteredModules().values()) options.push({ value: entry.id, label: entry.title, selected: entry.id === this.#scope });
    return { options, available: !!this.#entries };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector('input[name="atlas-docs-query"]');
    if (!input) return;
    const list = this.element.querySelector('.atlas-docs-results');
    input.addEventListener('input', () => this.#renderResults(input.value, list));
    this.element.querySelector('select[name="atlas-docs-scope"]')?.addEventListener('change', (event) => {
      this.#scope = event.target.value;
      this.#renderResults(input.value, list);
    });
    this.#renderResults('', list);
    input.focus();
  }

  /**
   * Read the whole wiki index.
   * @returns {Promise<?Array<object>>} Index entries, or null when the wiki is unreachable.
   */
  static async #fetchIndex() {
    try {
      const res = await fetch(WIKI_SEARCH_URL);
      if (!res.ok) return null;
      const { results } = await res.json();
      return results ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Render the index filtered by the selected module and the query text.
   * @param {string} query  Raw search input.
   * @param {HTMLElement} list  Result list element.
   */
  #renderResults(query, list) {
    const text = query.trim().toLowerCase();
    const matches = this.#entries.filter((entry) => {
      if (this.#scope !== 'all' && entry.module !== this.#scope) return false;
      return !text || `${entry.title} ${entry.heading ?? ''}`.toLowerCase().includes(text);
    });

    if (!matches.length) {
      const message = document.createElement('li');
      message.className = 'atlas-docs-message';
      message.textContent = game.i18n.localize('ATLAS.DocsSearch.NoResults');
      list.replaceChildren(message);
      return;
    }

    list.replaceChildren(
      ...matches.map((entry) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = entry.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = entry.heading ? `${entry.title} — ${entry.heading}` : entry.title;
        const label = document.createElement('span');
        label.className = 'atlas-docs-module';
        label.textContent = entry.moduleLabel;
        item.append(link, label);
        return item;
      })
    );
  }
}
