/**
 * @module
 * The locales module's configuration slice: which translation apps this deployment holds words
 * for. Read through `./apps.ts`.
 */

import { defineConfig } from '@infrastructure/config/define';
import { csv, text } from '@infrastructure/config/fields';

/** The app ids this deployment holds words for. */
export const localesConfig = defineConfig({
    name: 'locales-apps',
    shape: {
        NODE_LOCALE_APP_BACKEND: text({ default: 'demo-be' }),
        NODE_LOCALE_APP_FRONTEND: text({ default: 'demo-fe' }),
        NODE_LOCALE_APPS_EXTRA: csv()
    }
});
