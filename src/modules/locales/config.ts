/**
 * @module
 * The locales module's configuration slice: which translation tenants this deployment holds words
 * for. Read through `./tenants.ts`.
 */

import { defineConfig } from '@infrastructure/config/define';
import { csv, text } from '@infrastructure/config/fields';

/** The tenant ids this deployment holds words for. */
export const localesConfig = defineConfig({
    name: 'locales-tenants',
    shape: {
        NODE_LOCALE_TENANT_BACKEND: text({ default: 'demo-be' }),
        NODE_LOCALE_TENANT_FRONTEND: text({ default: 'demo-fe' }),
        NODE_LOCALE_TENANTS_EXTRA: csv()
    }
});
