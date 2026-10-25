import { MODULE } from './constants.mjs';
import { collectSystemData, renderFullReport } from './diagnostics.mjs';
import { getRegisteredModules } from './registry.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {string} Parks a report on 3deathsaves.com; the user confirms it there after signing in with Discord. */
const REPORT_PENDING_URL = 'https://www.3deathsaves.com/report-pending';

/** Shared troubleshooter for all 3DS modules — scoped diagnostics for bug reports. */
export default class Troubleshooter extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} Report scope: `'all'` or a registered module id. */
  #scope = 'all';

  /** @type {?{core: ?object, sizes: ?Object<string, number>}} Cached system metrics (fetched once). */
  #system = null;

  static DEFAULT_OPTIONS = {
    id: 'atlas-troubleshooter',
    classes: ['atlas', 'atlas-troubleshooter'],
    window: { title: 'ATLAS.Troubleshooter.Title', icon: 'fas fa-stethoscope', resizable: true, contentClasses: ['standard-form'] },
    position: { width: 720, height: 'auto' },
    actions: { copyReport: Troubleshooter.#onCopyReport, exportReport: Troubleshooter.#onExportReport, sendToSupport: Troubleshooter.#onSendToSupport }
  };

  static PARTS = {
    body: { template: `modules/${MODULE.ID}/templates/troubleshooter/body.hbs` },
    footer: { template: `modules/${MODULE.ID}/templates/troubleshooter/footer.hbs` }
  };

  /** @inheritdoc */
  async _prepareContext() {
    this.#system ??= await collectSystemData();
    const options = [{ value: 'all', label: game.i18n.localize('ATLAS.Troubleshooter.AllModules'), selected: this.#scope === 'all' }];
    for (const entry of getRegisteredModules().values()) options.push({ value: entry.id, label: entry.title, selected: entry.id === this.#scope });
    return { options, report: await renderFullReport(this.#scope, this.#system) };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('select[name="atlas-scope"]')?.addEventListener('change', (event) => {
      this.#scope = event.target.value;
      this.render();
    });
  }

  /**
   * Copy the report for the current scope to the clipboard.
   * @returns {Promise<void>}
   */
  static async #onCopyReport() {
    await game.clipboard.copyPlainText(await renderFullReport(this.#scope, this.#system, 'copy'));
    ui.notifications.info('ATLAS.Troubleshooter.Copied', { localize: true });
  }

  /**
   * Download the report for the current scope as a timestamped Markdown file.
   * @returns {Promise<void>}
   */
  static async #onExportReport() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
    const scope = this.#scope === 'all' ? 'ALL' : this.#scope;
    foundry.utils.saveDataToFile(await renderFullReport(this.#scope, this.#system, 'export'), 'text/markdown', `3DSATLAS_TROUBLESHOOTER_${scope}_${stamp}.md`);
    ui.notifications.info('ATLAS.Troubleshooter.Exported', { localize: true });
  }

  /**
   * Client name for the support info block: the desktop app, else the browser brand from core's support data.
   * @returns {string}
   */
  #clientName() {
    const ua = navigator.userAgent;
    if (ua.includes('FoundryVirtualTabletop') || ua.includes('Electron')) return 'FoundryVTT';
    return this.#system?.core?.client ?? ua;
  }

  /**
   * Collect the report in Foundry, park it on 3deathsaves.com, and open the confirmation window
   * where the user signs in with Discord and submits it.
   * @returns {Promise<void>}
   */
  static async #onSendToSupport() {
    const modules = [...getRegisteredModules().values()];
    const moduleOptions = modules.map((m) => `<option value="${m.id}"${m.id === this.#scope ? ' selected' : ''}>${m.title}</option>`).join('');
    const content = `
      ${
        this.#scope === 'all'
          ? `<div class="form-group">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Module')}</label>
        <select name="module" required><option value="" disabled selected>…</option>${moduleOptions}</select>
      </div>`
          : ''
      }
      <div class="form-group">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Summary')}</label>
        <input type="text" name="title" maxlength="120" required>
      </div>
      <div class="form-group stacked">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Description')}</label>
        <textarea name="description" rows="4" required></textarea>
      </div>
      <div class="form-group stacked">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Steps')}</label>
        <textarea name="steps" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Isolated')}</label>
        <input type="checkbox" name="isolated">
      </div>`;
    const result = await foundry.applications.api.DialogV2.prompt({
      classes: ['atlas', 'atlas-report'],
      window: { title: 'ATLAS.Troubleshooter.Support.Title', icon: 'fas fa-bug', contentClasses: ['standard-form'] },
      position: { width: 520 },
      content,
      ok: {
        label: 'ATLAS.Troubleshooter.Support.Post',
        icon: 'fas fa-paper-plane',
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return;
    const moduleId = this.#scope === 'all' ? result.module : this.#scope;
    if (!moduleId || !result.title?.trim() || !result.description?.trim()) return void ui.notifications.warn('ATLAS.Troubleshooter.Support.Required', { localize: true });

    const payload = {
      type: 'bug',
      module: moduleId,
      title: result.title.trim(),
      description: result.description.trim(),
      steps: result.steps?.trim() ?? '',
      browser: this.#clientName(),
      isolated: result.isolated ? 'yes' : 'no',
      report: await renderFullReport('all', this.#system, 'export')
    };

    let response;
    try {
      response = await fetch(REPORT_PENDING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {
      return void ui.notifications.error('ATLAS.Troubleshooter.Support.Failed', { localize: true });
    }
    if (!response.ok) return void ui.notifications.error('ATLAS.Troubleshooter.Support.Failed', { localize: true });

    const { url } = await response.json();
    const popup = window.open(url, 'atlas-report', 'popup,width=560,height=760');
    if (!popup) {
      await foundry.applications.api.DialogV2.prompt({
        classes: ['atlas', 'atlas-report'],
        window: { title: 'ATLAS.Troubleshooter.Support.Title', icon: 'fas fa-bug', contentClasses: ['standard-form'] },
        content: `<p>${game.i18n.localize('ATLAS.Troubleshooter.Support.PopupBlocked')}</p><p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`,
        rejectClose: false
      });
      return;
    }
    ui.notifications.info('ATLAS.Troubleshooter.Support.Parked', { localize: true });
  }
}
