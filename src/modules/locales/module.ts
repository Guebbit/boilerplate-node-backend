import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
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
 * TIER 2 is the CLIENT's copy — the two collections this module owns, edited at runtime by people
 * who do not open a code editor and served by `GET /locales/:locale/messages`. Nothing on the
 * request path reads it. That is what buys the guarantee this module is arranged around: Mongo
 * down, a language half-translated, a malformed key — the worst outcome is one endpoint failing
 * while every other response still resolves its own copy normally.
 *
 * The trap the split avoids, stated plainly: a language existing in the database does NOT mean the
 * API can answer in it. `GET /locales` therefore reports `scopes` per language rather than a list
 * of tags, so "may I send `Accept-Language: es`" and "may I download a Spanish dictionary" stay
 * two questions.
 *
 * ## No `index.ts`
 *
 * Nothing imports this module and nothing should. Everything the rest of the app needs from i18n
 * comes from `@infrastructure/i18n`, which sits below modules and must stay there — a module that
 * `infrastructure` had to reach for its own translations would invert the one layering rule this
 * codebase enforces in two places.
 */
export default {
    name: 'locales',
    /*
     * A translations admin is something every application grows and none of them differ about. The
     * interesting modelling here is the tier split, which is a decision about where data lives
     * rather than a domain to build entities for.
     */
    subdomain: 'generic',
    language: {
        Language:
            'A tag this deployment offers, from either tier. Registering one in the database never teaches the API to answer in it — only a deployed file does that.',
        Entry: 'One translated string: a language, a dotted key and its text. Stored one row per pair, so a key is editable on its own.',
        Dictionary:
            'The nested tree a client consumes, built from entries on read. Never stored in that shape — the rows are flat because flat is what is editable.',
        Revision:
            "A counter on a language, bumped by any write to its entries. The client's answer to 'do I need to download this again', and never a content hash.",
        Scope: 'What a language can do here — answer API requests, offer a downloadable dictionary, or both. The two are independent facts and the manifest reports both.'
    },
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
