import { MODULE, SETTINGS } from './constants.mjs';
import { getRegisteredModules } from './registry.mjs';

/**
 * Collect a module's registered settings.
 * @param {string} moduleId  Namespace to filter game.settings by.
 * @returns {Array<{key: string, value: string}>}
 */
function collectSettings(moduleId) {
  const out = [];
  for (const [, setting] of game.settings.settings) {
    if (setting.namespace !== moduleId) continue;
    let value = game.settings.get(moduleId, setting.key);
    if (value !== null && typeof value === 'object') value = JSON.stringify(value);
    out.push({ key: setting.key, value: String(value) });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Theme selection summary for a module from ATLAS's own settings.
 * @param {string} moduleId  Registered module id.
 * @returns {{selected: string, forced: ?string}}
 */
function collectTheme(moduleId) {
  const selected = (game.settings.get(MODULE.ID, SETTINGS.MODULE_THEMES) || {})[moduleId]?.theme ?? 'default';
  const forced = (game.settings.get(MODULE.ID, SETTINGS.FORCED_THEMES) || {})[moduleId] ?? null;
  return { selected, forced };
}

/**
 * Troubleshooter lines for the dnd5e CompendiumBrowser's enabled sources.
 * @returns {string[]}
 */
export function dnd5eSourceLines() {
  if (game.system.id !== 'dnd5e') return [];
  const sources = game.settings.get('dnd5e', 'packSourceConfiguration') ?? {};
  const enabled = [];
  for (const { collection, documentName } of game.packs) {
    if (documentName !== 'Actor' && documentName !== 'Item') continue;
    if (sources[collection] !== false) enabled.push(collection);
  }
  return ['#### CompendiumBrowser Sources (enabled)', '', ...enabled.sort().map((c) => `- ${c}`)];
}

/**
 * Invoke a module's optional debug callback.
 * @param {?Function} fn                 The module's debug callback.
 * @param {{mode: string}} ctx           Report context passed to the hook.
 * @returns {Promise<string[]>}
 */
async function collectDebug(fn, ctx) {
  if (typeof fn !== 'function') return [];
  try {
    const out = await fn(ctx);
    return Array.isArray(out) ? out.map(String) : out ? [String(out)] : [];
  } catch (err) {
    return [`_debug hook threw: ${err.message}_`];
  }
}

/**
 * Resolve each module's debug lines in place.
 * @param {object[]} modules      buildReport().modules
 * @param {{mode: string}} ctx    Report context; `mode` is `'display'`, `'copy'`, or `'export'`.
 * @returns {Promise<void>}
 */
export async function resolveDebug(modules, ctx) {
  await Promise.all(
    modules.map(async (m) => {
      m.debug = await collectDebug(m.debugFn, ctx);
    })
  );
}

/**
 * Build the ATLAS diagnostics snapshot.
 * @param {string} [scope]  `'all'` (default) for every registered 3DS module, or a single module id.
 * @returns {object}
 */
export function buildReport(scope = 'all') {
  const registry = getRegisteredModules();
  const ids = scope === 'all' ? [...registry.keys()] : registry.has(scope) ? [scope] : [];
  const modules = ids.map((id) => {
    const entry = registry.get(id);
    return {
      id,
      title: entry.title,
      version: game.modules.get(id).version,
      github: entry.github,
      themeScope: entry.theme?.scope ?? null,
      theme: collectTheme(id),
      settings: collectSettings(id),
      debugFn: entry.debug
    };
  });
  const allModules = game.modules.map((m) => ({ id: m.id, title: m.title, version: m.version, manifest: m.manifest, active: m.active })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    scope,
    generated: new Date().toLocaleString(),
    language: game.settings.get('core', 'language'),
    world: game.world.id,
    activeModuleCount: allModules.filter((m) => m.active).length,
    moduleCount: allModules.length,
    allModules,
    modules
  };
}

/**
 * Markdown lines for the per-3DS-module sections.
 * @param {object[]} modules  buildReport().modules
 * @returns {string[]}
 */
function moduleSectionLines(modules) {
  const L = [];
  for (const m of modules) {
    L.push(`## ${m.title} (${m.id}) v${m.version}`, '');
    L.push(`- Theme: ${m.theme.selected}${m.theme.forced ? ` (forced: ${m.theme.forced})` : ''}`);
    if (m.settings.length) {
      L.push('', '### Settings', '');
      for (const s of m.settings) L.push(`- \`${s.key}\`: ${s.value}`);
    }
    if (m.debug?.length) {
      L.push('', '### Debug', '');
      for (const line of m.debug) L.push(line);
    }
    L.push('');
  }
  return L;
}

/**
 * Line for one module in Foundry's core support format, marking inactive ones.
 * @param {{id: string, version: string, title: string, manifest: string, active: boolean}} m  Module summary from buildReport().allModules.
 * @returns {string}
 */
function moduleLine(m) {
  return `${m.id} | ${m.version} | "${m.title}" | "${m.manifest}"${m.active ? '' : ' | (inactive)'}`;
}

/**
 * Lightweight ATLAS-only Markdown report (synchronous; used by the API).
 * @param {string} [scope]  `'all'` (default) or a single module id.
 * @returns {string}
 */
export function reportToMarkdown(scope = 'all') {
  const r = buildReport(scope);
  const L = ['# 3DS:ATLAS Troubleshooter', '', `_Generated ${r.generated}_`, ''];
  L.push(
    '## Environment',
    '',
    `- Foundry: ${game.version}`,
    `- System: ${game.system.id} ${game.system.version}`,
    `- Language: ${r.language}`,
    `- World: ${r.world}`,
    `- Modules: ${r.activeModuleCount} active / ${r.moduleCount} total`,
    ''
  );
  L.push(...moduleSectionLines(r.modules));
  L.push('## All Modules', '', ...r.allModules.map(moduleLine));
  return L.join('\n');
}

/**
 * Gather Foundry's own support metrics plus world/compendium sizes.
 * @returns {Promise<{core: ?object, sizes: ?Object<string, number>}>}
 */
export async function collectSystemData() {
  let core = null;
  try {
    core = await foundry.applications?.sidebar?.apps?.SupportDetails?.generateSupportReport();
  } catch {
    core = null;
  }
  let sizes = null;
  try {
    sizes = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      game.socket.emit('sizeInfo', (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  } catch {
    sizes = null;
  }
  return { core, sizes };
}

/**
 * Full troubleshooter report.
 * @param {string} scope                                            `'all'` or a single module id.
 * @param {{core: ?object, sizes: ?Object<string, number>}} system    Result of collectSystemData().
 * @param {string} [mode]                                             Report context for debug hooks: `'display'` (default), `'copy'`, or `'export'`.
 * @returns {Promise<string>}
 */
export async function renderFullReport(scope, system, mode = 'display') {
  const r = buildReport(scope);
  await resolveDebug(r.modules, { mode });
  const core = system?.core ?? {};
  const sizes = system?.sizes ?? null;
  const L = ['# 3DS:ATLAS Troubleshooter', '', `_Generated ${r.generated}_`, ''];
  L.push('## System', '');
  L.push(`- Foundry: ${core.coreVersion ?? game.version}`);
  L.push(`- System: ${core.systemVersion ?? `${game.system.id}, ${game.system.version}`}`);
  L.push(`- Language: ${r.language}`);
  L.push(`- World: ${r.world}`);
  L.push(`- Modules: ${r.activeModuleCount} active / ${r.moduleCount} total`);
  if (core.performanceMode) L.push(`- Performance Mode: ${core.performanceMode}`);
  if (core.screen) L.push(`- Screen: ${core.screen}`);
  if (core.viewport) L.push(`- Viewport: ${core.viewport}`);
  if (core.os) L.push(`- OS: ${core.os}`);
  if (core.client) L.push(`- Client: ${core.client}`);
  if (core.gpu) L.push(`- GPU: ${core.gpu}`);
  if (core.maxTextureSize) L.push(`- Max Texture Size: ${core.maxTextureSize}`);
  L.push('');
  if (core.hasViewedScene) {
    L.push(
      '## Scene',
      '',
      `- Dimensions: ${core.sceneDimensions} | Grid: ${core.grid} | Padding: ${core.padding}`,
      `- Walls: ${core.walls} | Lights: ${core.lights} | Sounds: ${core.sounds} | Tiles: ${core.tiles} | Tokens: ${core.tokens}`
    );
    if (core.largestTexture) L.push(`- Largest Texture: ${core.largestTexture.width} × ${core.largestTexture.height}`);
    L.push('');
  }
  if (core.actors !== undefined) {
    L.push(
      '## Counts',
      '',
      `- Actors: ${core.actors} | Items: ${core.items} | Journal: ${core.journal} | Tables: ${core.tables} | Playlists: ${core.playlists} | Chat: ${core.messages} | Packs: ${core.packs}`,
      `- World Scripts: ${core.worldScripts}`,
      ''
    );
  }
  L.push(...moduleSectionLines(r.modules));
  if (sizes) {
    const world = [];
    const packs = [];
    for (const entry of Object.entries(sizes)) (entry[0].includes('.') ? packs : world).push(entry);
    if (world.length) {
      L.push('## World Data', '');
      for (const [name, bytes] of world) {
        let collection = game[name];
        if (name === 'fog') collection = game.collections.get('FogExploration');
        else if (name === 'settings') collection = game.collections.get('Setting');
        if (collection) L.push(`${collection.name}: ${collection.size} | ${foundry.utils.formatFileSize(bytes, { decimalPlaces: 0 })}`);
      }
      L.push('');
    }
    if (packs.length) {
      L.push('## Compendium Data', '');
      for (const [name, bytes] of packs) {
        const pack = game.packs.get(name);
        if (pack) L.push(`"${name}": ${pack.index.size} ${game.i18n.localize(pack.documentClass.metadata.labelPlural)} | ${foundry.utils.formatFileSize(bytes, { decimalPlaces: 0 })}`);
      }
      L.push('');
    }
  }
  L.push('## All Modules', '', ...r.allModules.map(moduleLine));
  return L.join('\n');
}
