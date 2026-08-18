import { CSS_NAMESPACE, HOOKS, MODULE, SETTINGS } from '../constants.mjs';
import { getModule, getRegisteredModules } from '../registry.mjs';
import { cssVar, DARK_COLORS, generateDerivedColors, isLight, THEME_PRESETS } from './presets.mjs';

/**
 * Read the per-module theme selection map.
 * @returns {Object<string, object>}
 */
export function getModuleThemes() {
  return game.settings.get(MODULE.ID, SETTINGS.MODULE_THEMES) || {};
}

/**
 * Read the world-scoped forced-theme override map.
 * @returns {Object<string, string>}
 */
export function getForcedThemes() {
  return game.settings.get(MODULE.ID, SETTINGS.FORCED_THEMES) || {};
}

/**
 * Read the GM-forced theme key for a module, if any.
 * @param {string} moduleId  Registered module id
 * @returns {string|null}
 */
export function getForcedTheme(moduleId) {
  return getForcedThemes()[moduleId] || null;
}

/**
 * Set or clear the GM-forced theme for a module.
 * @param {string} moduleId       Registered module id
 * @param {string|null} keyOrNull  Theme key to force; null/'none' clears the override
 * @returns {Promise<void>}
 */
export async function setForcedTheme(moduleId, keyOrNull) {
  if (!game.user.isGM) return;
  const forced = getForcedThemes();
  if (!keyOrNull || keyOrNull === 'none') delete forced[moduleId];
  else forced[moduleId] = keyOrNull;
  await game.settings.set(MODULE.ID, SETTINGS.FORCED_THEMES, forced);
}

/**
 * Read the map of user-created custom themes.
 * @returns {Object<string, {name: string, basePreset: string, colors: object}>}
 */
export function getCustomThemes() {
  return game.settings.get(MODULE.ID, SETTINGS.CUSTOM_THEMES) || {};
}

/**
 * Whether a theme key refers to a user-created custom theme.
 * @param {string} key  Theme key
 * @returns {boolean}
 */
export function isCustomThemeKey(key) {
  return !!key && key.startsWith('custom_') && !THEME_PRESETS[key];
}

/**
 * Resolve the full color object for any theme key.
 * @param {string} key  Theme key
 * @returns {Object<string, string>}
 */
export function getColorsForTheme(key) {
  if (THEME_PRESETS[key]) return { ...THEME_PRESETS[key].colors };
  if (isCustomThemeKey(key)) {
    const custom = getCustomThemes()[key];
    if (custom) return { ...(THEME_PRESETS[custom.basePreset]?.colors || DARK_COLORS), ...custom.colors };
  }
  return { ...DARK_COLORS };
}

/**
 * Normalize a module's registered sub-application scopes.
 * @param {object} themeConfig  The module's registered `theme` config
 * @returns {Array<{key: string, label: string, selector: string}>}
 */
export function getAppScopes(themeConfig) {
  if (!themeConfig?.apps) return [];
  return Object.entries(themeConfig.apps).map(([key, v]) => (typeof v === 'string' ? { key, label: key, selector: v } : { key, label: v.label || key, selector: v.selector }));
}

/**
 * Build the CSS text for a scoped theme block.
 * @param {string} scope                   CSS selector
 * @param {Object<string, string>} colors  Color map
 * @returns {string}
 */
function buildScopedCss(scope, colors) {
  const decls = [];
  for (const [key, value] of Object.entries(colors)) if (value) decls.push(`${cssVar(key)}: ${value};`);
  for (const [name, value] of Object.entries(generateDerivedColors(colors))) decls.push(`${name}: ${value};`);
  decls.push(`color-scheme: ${colors.bg && isLight(colors.bg) ? 'light' : 'dark'};`);
  decls.push(`--color-scrollbar: var(${cssVar('border')});`);
  return `${scope} {\n  ${decls.join('\n  ')}\n}${buildAppCss(scope)}${buildHeaderCss(scope)}`;
}

/**
 * Bridge Foundry's own themeable custom properties to the scope's ATLAS vars, so core-styled
 * chrome inside a framed application follows the picked theme without per-module overrides.
 * Emitted through `:where()` so it outranks core's `.application` defaults while any rule a
 * module writes for itself still wins.
 * @param {string} scope  CSS selector
 * @returns {string}
 */
function buildAppCss(scope) {
  const ns = CSS_NAMESPACE;
  const roots = scope.split(',').map((s) => `:where(${s.trim()}).application`);
  const sel = roots.join(',');
  const fields = ['input', 'select', 'textarea', 'code-mirror', 'formula-input', 'color-picker', 'file-picker', 'document-tags', 'string-tags'];
  const fieldSel = roots.flatMap((r) => fields.map((f) => `${r} ${f}`)).join(',');
  const optSel = roots.flatMap((r) => [`${r} select option`, `${r} select optgroup`]).join(',');
  return `
${sel} {
  --background: var(--${ns}-bg);
  --color-border: var(--${ns}-border);
  --color-data-background: var(--${ns}-bg-lighter);
  --color-data-border: var(--${ns}-border);
  --color-fieldset-border: var(--${ns}-border);
  --color-form-hint: var(--${ns}-text-secondary);
  --color-form-hint-hover: var(--${ns}-text);
  --color-form-label: var(--${ns}-text);
  --color-form-label-hover: var(--${ns}-text-heading);
  --color-level-error: var(--${ns}-error);
  --color-level-info: var(--${ns}-primary);
  --color-level-success: var(--${ns}-success);
  --color-level-warning: var(--${ns}-warning);
  --color-shadow-primary: var(--${ns}-primary);
  --color-select-option-bg: var(--${ns}-bg-lighter);
  --color-tabs-border: var(--${ns}-border);
  --color-text-accent: var(--${ns}-accent);
  --color-text-emphatic: var(--${ns}-text-heading);
  --color-text-primary: var(--${ns}-text);
  --color-text-secondary: var(--${ns}-text-secondary);
  --color-text-selection: var(--${ns}-text-on-color);
  --color-text-selection-bg: var(--${ns}-primary);
  --color-text-subtle: var(--${ns}-text-secondary);
  --button-background-color: var(--${ns}-button-bg);
  --button-border-color: var(--${ns}-button-border);
  --button-focus-outline-color: var(--${ns}-primary);
  --button-hover-background-color: var(--${ns}-button-hover);
  --button-hover-border-color: var(--${ns}-primary);
  --button-hover-text-color: var(--${ns}-button-text);
  --button-text-color: var(--${ns}-button-text);
  --content-link-background: var(--${ns}-surface-dim-25);
  --content-link-border-color: var(--${ns}-border);
  --content-link-icon-color: var(--${ns}-text-dim);
  --content-link-text-color: var(--${ns}-link);
}
${fieldSel} {
  --input-background-color: var(--${ns}-input-bg);
  --input-border-color: var(--${ns}-border);
  --input-focus-outline-color: var(--${ns}-primary);
  --input-focus-text-color: var(--${ns}-text);
  --input-placeholder-color: var(--${ns}-text-dim);
  --input-text-color: var(--${ns}-text);
}
${optSel} {
  color: var(--${ns}-text);
  background: var(--${ns}-bg-lighter);
}`;
}

/**
 * Build the window-frame rules for a scope.
 * @param {string} scope  CSS selector
 * @returns {string}
 */
function buildHeaderCss(scope) {
  const ns = CSS_NAMESPACE;
  const roots = scope.split(',').map((s) => s.trim());
  const sel = (suffix) => roots.map((r) => `${r} > .window-header${suffix}`).join(',');
  return `
${sel('')} {
  background: var(--${ns}-bg-lighter);
  color: var(--${ns}-title-text);
  border-bottom: 1px solid var(--${ns}-border);
}
${sel(' .window-icon')},${sel(' .window-title')} {
  color: var(--${ns}-title-text);
}
${sel(' button.header-control')} {
  --button-text-color: var(--${ns}-title-text);
  --button-hover-text-color: var(--${ns}-primary);
  --button-hover-background-color: var(--${ns}-bg-hover);
}`;
}

/**
 * Every document theme blocks must be written to: the main window plus any open detached window.
 * @returns {Document[]}
 */
function themeDocuments() {
  const docs = [document];
  for (const { window: win } of foundry.applications.detached?.windows?.values() ?? []) if (win && !win.closed) docs.push(win.document);
  return docs;
}

/**
 * Write or clear one scoped `<style>` element in each target document.
 * Resolving by id upserts in place, so repeated detach cycles never duplicate nodes.
 * @param {string} elId        Style element id
 * @param {string} scope       CSS selector
 * @param {string} [themeKey]  Theme key; omit or 'none' to clear
 * @param {Document[]} [docs]  Target documents; defaults to main plus detached
 * @returns {void}
 */
function writeBlock(elId, scope, themeKey, docs = themeDocuments()) {
  const css = !themeKey || themeKey === 'none' ? null : buildScopedCss(scope, getColorsForTheme(themeKey));
  for (const doc of docs) {
    let styleEl = doc.getElementById(elId);
    if (!css) {
      styleEl?.remove();
      continue;
    }
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = elId;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }
}

/**
 * Write a registered module's theme blocks without announcing a change.
 * @param {string} moduleId    Registered module id
 * @param {Document[]} [docs]  Target documents; defaults to main plus detached
 * @returns {object|null} The module's theme selection, or null when it has no themeable scope
 */
function writeModuleBlocks(moduleId, docs) {
  const mod = getModule(moduleId);
  if (!mod?.theme?.scope) return null;
  const selection = getModuleThemes()[moduleId] || {};
  const mainTheme = getForcedTheme(moduleId) || selection.theme || mod.theme.default || 'dark';
  writeBlock(`${CSS_NAMESPACE}-theme-${moduleId}`, mod.theme.scope, mainTheme, docs);
  for (const app of getAppScopes(mod.theme))
    writeBlock(`${CSS_NAMESPACE}-theme-${moduleId}-${app.key}`, app.selector, selection.apps?.[app.key] || mod.theme.apps?.[app.key]?.default || mainTheme, docs);
  return selection;
}

/**
 * Apply a registered module's saved theme.
 * @param {string} moduleId  Registered module id
 * @returns {void}
 */
export function applyModuleTheme(moduleId) {
  const selection = writeModuleBlocks(moduleId);
  if (selection) Hooks.callAll(HOOKS.THEME_CHANGED, { moduleId, selection });
}

/**
 * Apply every registered module's theme blocks into a newly detached window.
 * @param {Window} win  The detached window
 * @returns {void}
 */
export function syncDetachedWindow(win) {
  if (!win || win.closed) return;
  for (const moduleId of getRegisteredModules().keys()) writeModuleBlocks(moduleId, [win.document]);
}

/**
 * Persist and apply a module's theme selection.
 * @param {string} moduleId  Registered module id
 * @param {string} themeKey  Theme key to store ('none' clears)
 * @param {string} [appKey]  Sub-application key for a per-app override
 * @returns {Promise<void>}
 */
export async function setModuleTheme(moduleId, themeKey, appKey) {
  const themes = getModuleThemes();
  const entry = { ...themes[moduleId] };
  if (appKey) {
    const apps = { ...entry.apps };
    if (!themeKey || themeKey === 'none') delete apps[appKey];
    else apps[appKey] = themeKey;
    entry.apps = apps;
  } else {
    entry.theme = themeKey;
  }
  themes[moduleId] = entry;
  await game.settings.set(MODULE.ID, SETTINGS.MODULE_THEMES, themes);
  applyModuleTheme(moduleId);
}

/**
 * Create a new custom theme seeded from a base preset and persist it.
 * @param {string} basePreset  Preset key to seed colors from
 * @param {string} [name]      Display name
 * @returns {Promise<string>}
 */
export async function createCustomTheme(basePreset, name) {
  const themes = getCustomThemes();
  let n = 1;
  const prefix = `custom_${basePreset}_`;
  while (themes[`${prefix}${n}`]) n++;
  const key = `${prefix}${n}`;
  themes[key] = { name: name || `${_loc(THEME_PRESETS[basePreset]?.name || basePreset)} #${n}`, basePreset, colors: {} };
  await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_THEMES, themes);
  return key;
}

/**
 * Update a custom theme's colors, then re-apply any module using it.
 * @param {string} key                     Custom theme key
 * @param {Object<string, string>} colors  Overridden color values
 * @param {string} [name]                  New display name
 * @returns {Promise<void>}
 */
export async function updateCustomTheme(key, colors, name) {
  const themes = getCustomThemes();
  if (!themes[key]) return;
  themes[key] = { ...themes[key], colors: { ...themes[key].colors, ...colors }, ...(name ? { name } : {}) };
  await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_THEMES, themes);
  reapplyThemesUsing(key);
}

/**
 * Delete a custom theme; any module/app using it falls back to Default.
 * @param {string} key  Custom theme key
 * @returns {Promise<void>}
 */
export async function deleteCustomTheme(key) {
  const themes = getCustomThemes();
  delete themes[key];
  await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_THEMES, themes);
  reapplyThemesUsing(key);
}

/**
 * Export a custom theme as a portable JSON string.
 * @param {string} key  Custom theme key
 * @returns {string|null}
 */
export function exportCustomTheme(key) {
  const theme = getCustomThemes()[key];
  if (!theme) return null;
  return JSON.stringify({ name: theme.name, basePreset: theme.basePreset, colors: getColorsForTheme(key), version: 1 }, null, 2);
}

/**
 * Import a custom theme from a JSON string produced by exportCustomTheme.
 * @param {string} json  Theme JSON
 * @returns {Promise<string|null>}
 */
export async function importCustomTheme(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data?.colors) return null;
  const base = THEME_PRESETS[data.basePreset] ? data.basePreset : 'dark';
  const key = await createCustomTheme(base, data.name);
  await updateCustomTheme(key, data.colors);
  return key;
}

/**
 * Re-apply themes for every module/app currently referencing a given theme key.
 * @param {string} key  Theme key
 * @returns {void}
 */
function reapplyThemesUsing(key) {
  const selections = getModuleThemes();
  for (const [moduleId, sel] of Object.entries(selections)) {
    if (sel.theme === key || Object.values(sel.apps || {}).includes(key)) applyModuleTheme(moduleId);
  }
}

/**
 * Apply every registered module's saved theme. Run on ready and after registration.
 * @returns {void}
 */
export function initializeThemes() {
  for (const moduleId of getRegisteredModules().keys()) applyModuleTheme(moduleId);
}
