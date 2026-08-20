import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerLocaleOverrideProvider } from '@infrastructure/i18n';
import { router } from './routes';
import { localeService } from './service';
import { seedLocalesCollection, exportSeededLocales } from './demo';

/**
 * Languages: which ones this deployment speaks, and the dictionaries a client downloads.
 *
 * ## Two tiers, and they never merge
 *
 * TIER 1 is the API's OWN copy — `src/locales/*.json` plus every module's `locales/` folder,
 * loaded into i18next at boot by `@infrastructure/i18n`. It is what `t()` resolves, what decides
 * `Content-Language`, and what `GET /locales/:locale` serves. It stays on the filesystem
 * permanently: it exists so a client can render copy WHEN NO RESPONSE ARRIVES, and putting it
 * behind a database would make it unavailable in exactly the outage it was created for. There is a
 * second reason in `i18n.ts`'s own words — the supported list is cached per worker because a
 * per-request read would let the negotiated locale and the resolvable one disagree, and a header
 * that lies is worse than a language being unavailable.
 *
 * TIER 2 is the OVERRIDES — the two collections this module owns, edited at runtime by people who
 * do not open a code editor. One row per (language, scope, key), and `scope` says which of the two
 * dictionaries the row patches:
 *
 *   `app` rows are served by `GET /locales/:locale/messages`. A frontend merges them over what it
 *   bundles, key by key, so an unedited key keeps its bundled text and a language the client does
 *   not ship at all falls back per key for whatever nobody has translated yet.
 *
 *   `api` rows are layered over tier 1 by `@infrastructure/i18n`, which rebuilds its overlay at
 *   boot, on a timer and after every admin write. They never leave this API — a frontend that
 *   merged them would be adopting the backend's keyspace as its own.
 *
 * NOTHING here is awaited on the request path, which is what buys the guarantee this module is
 * arranged around: Mongo down, a language half-translated, a malformed key — the worst outcome is
 * one endpoint failing and the overlay going stale, while every other response still resolves its
 * own copy from the files normally.
 *
 * Both halves are OVERRIDES, never dictionaries. Neither side may introduce a key its files do not
 * already define and expect it to render — the files decide what exists, the rows decide what it
 * says.
 *
 * The trap the split avoids, stated plainly: a language existing in the database does NOT mean the
 * API can answer in it. `GET /locales` therefore reports `scopes` per language rather than a list
 * of tags, so "may I send `Accept-Language: es`" and "may I download a Spanish dictionary" stay
 * two questions.
 *
 * Spanish is that example on purpose and not by accident — the demo dataset registers `es` with no
 * `src/locales/es.json` behind it, so the answers really are `no` and `yes`. See `./demo.ts`, which
 * lays out which language covers which square of that grid.
 *
 * ## No `index.ts`
 *
 * Nothing imports this module and nothing should. Everything the rest of the app needs from i18n
 * comes from `@infrastructure/i18n`, which sits below modules and must stay there — a module that
 * `infrastructure` had to reach for its own translations would invert the one layering rule this
 * codebase enforces in two places.
 */
/*
 * The `api` half of this module's collection, handed to `@infrastructure/i18n` so an override typed
 * into the admin screens reaches `t()`.
 *
 * Registered HERE, at import time, rather than declared as a manifest field — the same way
 * `audit-logs` installs its sink and `account` its auth resolver. A field only one module can ever
 * fill is a field `app.ts` has to go looking for, and it went looking with a `.find()` that would
 * have silently picked one of two. Registering a function touches no database: `readApiOverrides`
 * runs on the refresh, which cannot happen before the app serves a request.
 */
registerLocaleOverrideProvider(() => localeService.readApiOverrides());

export default {
    name: 'locales',
    /*
     * A translations admin is something every application grows and none of them differ about. The
     * interesting modelling here is the tier split, which is a decision about where data lives
     * rather than a domain to build entities for.
     */
    subdomain: 'generic',
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
