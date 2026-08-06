import { exposeApi } from './scripts/api.mjs';
import { HOOKS, MODULE } from './scripts/constants.mjs';
import { initializeRelay } from './scripts/relay.mjs';
import ATLASSettings from './scripts/settings.mjs';
import { applyModuleTheme, initializeThemes } from './scripts/theme/theme-engine.mjs';
import { checkForUpdates } from './scripts/updates/update-checker.mjs';
import { initializeLogger, log } from './scripts/utils/logger.mjs';
import './styles/global.css';
import './styles/theme.css';

Hooks.once('init', () => {
  exposeApi();
  ATLASSettings.registerSettings();
  foundry.applications.handlebars.loadTemplates([`modules/${MODULE.ID}/templates/theme-config/select.hbs`]);
});

Hooks.once('ready', async () => {
  initializeLogger();
  initializeRelay();
  initializeThemes();
  Hooks.callAll(HOOKS.READY);
  await checkForUpdates();
  log(3, '3DS:ATLAS ready.');
});

Hooks.on(HOOKS.REGISTERED, (entry) => applyModuleTheme(entry.id));
