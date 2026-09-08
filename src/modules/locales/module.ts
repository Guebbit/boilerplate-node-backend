/**
 * @module
 * Languages: which ones this deployment speaks, and the dictionaries a client downloads. Two
 * tiers that never merge — deployed files loaded into i18next at boot, and runtime overrides this
 * module owns, one row per (language, tenant, key) — and neither is ever awaited on the request
 * path, so a database outage costs only a stale overlay. No `index.ts`: nothing imports this
 * module and nothing should; everything else reaches i18n through `@infrastructure/i18n`.
 *
 * See: docs/modules/locales.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerLocaleOverrideProvider } from '@infrastructure/i18n';
import { router } from './routes';
import { localeService } from './services';

/*
 * The backend tenant's share of this module's collection, handed to `@infrastructure/i18n` so an
 * override typed into the admin screens reaches `t()`.
 *
 * Registered HERE, at import time, rather than declared as a manifest field — the same way
 * `audit-logs` installs its sink. A field only one module can fill is one `app.ts` would have to
 * go looking for. Touches no database: `readApiOverrides` only runs on the refresh.
 */
registerLocaleOverrideProvider(() => localeService.readApiOverrides());

/** This module's manifest entry: routes and its own locales. */
export default {
    name: 'locales',
    basePath: '/locales',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: [
        'locales.read',
        'locales.create',
        'locales.update',
        'locales.delete',
        'locales.manage'
    ],
    routes: router,
    /*
     * Its own copy, for its own error messages. The module that owns the translation feature was
     * the last one in the repo with no translations of its own, which was funny and also a bug:
     * a 409 on a key collision was reaching admins in English regardless of what they asked for.
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
