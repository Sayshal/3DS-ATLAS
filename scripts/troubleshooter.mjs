import { MODULE } from './constants.mjs';
import { collectSystemData, renderFullReport } from './diagnostics.mjs';
import { getRegisteredModules } from './registry.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {string} Public endpoint that forwards troubleshooter submissions to the Discord support forum. */
const SUPPORT_URL = 'https://www.3deathsaves.com/support-report';

/** @type {string} Invite link to the 3 Death Saves Discord server. */
const DISCORD_INVITE = 'https://discord.gg/PzzUwU9gdz';

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
    ui.notifications.info('ATLAS.Troubleshooter.Copied');
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
    ui.notifications.info('ATLAS.Troubleshooter.Exported');
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
   * Prompt for a quick description, then post the report to the Discord support forum.
   * @returns {Promise<void>}
   */
  static async #onSendToSupport() {
    const content = `
      <div class="form-group stacked">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Description')}</label>
        <textarea name="description" rows="4" required></textarea>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.DiscordName')}</label>
        <input type="text" name="discordName" required>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize('ATLAS.Troubleshooter.Support.Isolated')}</label>
        <input type="checkbox" name="isolated">
      </div>`;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: 'ATLAS.Troubleshooter.Support.Title', icon: 'fab fa-discord' },
      position: { width: 480 },
      content,
      ok: {
        label: 'ATLAS.Troubleshooter.Support.Post',
        icon: 'fas fa-paper-plane',
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return;
    if (!result.description?.trim() || !result.discordName?.trim()) return void ui.notifications.warn('ATLAS.Troubleshooter.Support.Required');

    const entry = this.#scope === 'all' ? null : getRegisteredModules().get(this.#scope);
    const payload = {
      description: result.description.trim(),
      discordName: result.discordName.trim(),
      foundry: `Version ${game.release.generation} Build ${game.release.build}`,
      system: `${game.system.id} ${game.system.version}`,
      module: entry ? `${entry.title} ${game.modules.get(entry.id)?.version ?? ''}`.trim() : `All 3DS modules (ATLAS ${game.modules.get(MODULE.ID)?.version})`,
      moduleTitle: entry?.title ?? '',
      browser: this.#clientName(),
      isolated: result.isolated ? 'Yes' : 'No',
      report: await renderFullReport(this.#scope, this.#system, 'export')
    };

    let response;
    try {
      response = await fetch(SUPPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {
      return void ui.notifications.error('ATLAS.Troubleshooter.Support.Failed');
    }
    if (response.status === 429) return void ui.notifications.warn('ATLAS.Troubleshooter.Support.RateLimited');
    if (!response.ok) return void ui.notifications.error('ATLAS.Troubleshooter.Support.Failed');

    const { url, memberFound } = await response.json();
    const lines = [
      `<p>${game.i18n.localize('ATLAS.Troubleshooter.Support.Posted')}</p>`,
      `<p>${game.i18n.localize(memberFound ? 'ATLAS.Troubleshooter.Support.MemberFound' : 'ATLAS.Troubleshooter.Support.MemberMissing')}</p>`
    ];
    if (!memberFound) lines.push(`<p><a href="${DISCORD_INVITE}" target="_blank" rel="noopener">${DISCORD_INVITE}</a></p>`);
    lines.push(`<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`);
    await foundry.applications.api.DialogV2.prompt({
      window: { title: 'ATLAS.Troubleshooter.Support.Title', icon: 'fab fa-discord' },
      content: lines.join(''),
      rejectClose: false
    });
  }
}
