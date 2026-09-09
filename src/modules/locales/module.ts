/**
 * @module
 * Languages: which ones this deployment speaks, and the dictionaries a client downloads. Two
 * tiers that never merge — deployed files loaded into i18next at boot, and runtime overrides this
 * module owns, one row per (language, tenant, key) — and neither is ever awaited on the request
 * path, so a database outage costs only a stale overlay. No `index.ts`: no sibling module reaches
 * in, and everything else reaches i18n through `@infrastructure/i18n` — the one exception is the
 * `app` tier, which alone may see which modules exist, handing this file the `translatables`
 * lookup it cannot collect itself.
 *
 * See: docs/modules/locales.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerLocaleOverrideProvider, registerTranslationPort } from '@infrastructure/i18n';
import { router } from './routes';
import { localeService } from './services';
import { translationRepository } from './repository';
import { planForPort, writeForPort } from './services/translations';

/**
 * Hands the app tier the one function it needs from this module: `resolveTranslatables`'s result,
 * for a caller that cannot reach `services/index.ts` directly — this file, alongside a possible
 * `index.ts`, is the only path `depcruise`'s `module-internals-are-private` rule lets anything
 * outside a module reach into.
 */
export const { setTranslatables } = localeService;

/*
 * The backend tenant's share of this module's collection, handed to `@infrastructure/i18n` so an
 * override typed into the admin screens reaches `t()`.
 *
 * Registered HERE, at import time, rather than declared as a manifest field — the same way
 * `audit-logs` installs its sink. A field only one module can fill is one `app.ts` would have to
 * go looking for. Touches no database: `readApiOverrides` only runs on the refresh.
 */
registerLocaleOverrideProvider(() => localeService.readApiOverrides());

/*
 * This module's implementation of the translation port, registered at import time the same way —
 * `resolve` is what a read-path decorator batches a page against, `removeAll` is what a product's
 * HARD delete calls to take its translations with it in the same operation, `search` is what a
 * free-text search unions with an entity's own (fallback-language) match, and `plan`/`write` are
 * what a caller with its own entity to write (`productService.write`) validates and applies the
 * translations half of its request through.
 */
registerTranslationPort({
    resolve: translationRepository.resolveEntityFields,
    removeAll: translationRepository.removeEntityTranslations,
    search: translationRepository.findEntityIdsByFieldMatch,
    plan: planForPort,
    write: writeForPort
});

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
        'locales.manage',
        'translations.read',
        'translations.manage'
    ],
    routes: router,
    /*
     * Its own copy, for its own error messages. The module that owns the translation feature was
     * the last one in the repo with no translations of its own, which was funny and also a bug:
     * a 409 on a key collision was reaching admins in English regardless of what they asked for.
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
