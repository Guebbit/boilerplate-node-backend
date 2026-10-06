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
        NODE_LOCALE_TENANT_BACKEND: text({
            default: 'demo-be',
            describe: 'The id of the API’s own translation tenant.'
        }),
        NODE_LOCALE_TENANT_FRONTEND: text({
            default: 'demo-fe',
            describe: 'The id of the default frontend translation tenant.'
        }),
        NODE_LOCALE_TENANTS_EXTRA: csv({
            describe: 'Further frontend tenants as `id=Label` pairs, comma-separated.'
        })
    }
});
