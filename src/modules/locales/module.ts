/**
 * @module
 * Languages: which ones this deployment speaks, and the dictionaries a client downloads. Two
 * tiers that never merge — deployed files loaded into i18next at boot, and runtime overrides this
 * module owns, one row per (language, tenant, key) — and neither is ever awaited on the request
 * path, so a database outage costs only a stale overlay. No `index.ts`: nothing imports this
 * module and nothing should; everything else reaches i18n through `@infrastructure/i18n`.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   nothing, and nothing should — see above
 *
 * See: docs/modules/locales.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerLocaleOverrideProvider } from '@infrastructure/i18n';
import { router } from './routes';
import { localeService } from './services';
import { seedLocalesCollection, exportSeededLocales } from './demo';

/*
 * The backend tenant's share of this module's collection, handed to `@infrastructure/i18n` so an
 * override typed into the admin screens reaches `t()`.
 *
 * Registered HERE, at import time, rather than declared as a manifest field — the same way
 * `audit-logs` installs its sink. A field only one module can fill is one `app.ts` would have to
 * go looking for. Touches no database: `readApiOverrides` only runs on the refresh.
 */
registerLocaleOverrideProvider(() => localeService.readApiOverrides());

/** This module's manifest entry: routes, demo seeding, and its own locales. */
export default {
    name: 'locales',
    basePath: '/locales',
    routes: router,
    /*
     * Its own copy, for its own error messages. The module that owns the translation feature was
     * the last one in the repo with no translations of its own, which was funny and also a bug:
     * a 409 on a key collision was reaching admins in English regardless of what they asked for.
     */
    locales: path.join(__dirname, 'locales'),
    seeds: seedLocalesCollection,
    seedExport: exportSeededLocales,
    /* Neither row is served raw. `GET /locales` answers a composed capabilities envelope and
     * `GET /locales/:locale/messages` answers a nested tree built from the flat entries. */
    demoShapes: { locales: 'stored', localeEntries: 'stored' }
} satisfies AppModule;
