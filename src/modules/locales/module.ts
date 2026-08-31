/**
 * @module
 * Languages: which ones this deployment speaks, and the dictionaries a client downloads.
 *
 * Two tiers that never merge. TIER 1 is the API's own deployed files, loaded into i18next at
 * boot — kept on disk so it can still render copy when no response arrives at all. TIER 2 is the
 * overrides this module owns: rows editable at runtime, one per (language, tenant, key). Frontend
 * rows merge over what a client bundles; backend rows layer over tier 1 for this API's own copy.
 * Neither tier is ever awaited on the request path, so a database outage costs only a stale
 * overlay — everything else still resolves from the files normally.
 *
 * No `index.ts`: nothing imports this module and nothing should — everything else the app needs
 * from i18n comes from `@infrastructure/i18n` instead, which must stay below modules.
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
 * `audit-logs` installs its sink and `account` its auth resolver. A field only one module can ever
 * fill is a field `app.ts` has to go looking for, and it went looking with a `.find()` that would
 * have silently picked one of two. Registering a function touches no database: `readApiOverrides`
 * runs on the refresh, which cannot happen before the app serves a request.
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
    demoShapes: { locales: 'stored', localeMessages: 'stored' }
} satisfies AppModule;
