import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';
import type { Resource, TFunction } from 'i18next';
import { logger } from '@infrastructure/adapters/logger';

/**
 * Request-scoped i18n.
 *
 * `i18next`'s default export is one global instance with one active language, so two overlapping
 * requests in different languages interleave and one is answered in the other's. Instead:
 * `getFixedT(locale)` binds a `t` to one language and touches no global, and an
 * `AsyncLocalStorage` carries it down the request's async chain.
 *
 * Import `t` from here, never from `'i18next'`.
 *
 * ALS is scoped to an async CALL CHAIN. Queued work, boot-time callbacks and scripts all run
 * outside the store and fall back to the boot locale — out-of-band work must carry its locale in
 * the payload and bind with {@link runWithLocale}.
 *
 * See: docs/tools/i18n.md
 */

/**
 * Where the dictionaries live. Resolved from this file rather than from `process.cwd()`, so it is
 * the same directory whether the entry point is `src/cluster.ts`, a Jest worker or a migration.
 */
const LOCALES_DIRECTORY = path.join(__dirname, '..', 'locales');

/**
 * Fallbacks match `.env-example`; both are read lazily so a test can set them after import.
 */
export const getDefaultLocale = (): string => process.env.NODE_DEFAULT_LOCALE ?? 'en';
export const getFallbackLocale = (): string => process.env.NODE_FALLBACK_LOCALE ?? 'en';

let supportedLocalesCache: string[] | undefined;

/**
 * The locales this API can answer in — `NODE_SUPPORTED_LOCALES` when set, otherwise the directory
 * listing.
 *
 * READ ONCE, THEN CACHED, and that is load-bearing: `i18next.init()` registers its resources from
 * this list at boot and never revisits them, so a per-request read would let the middleware
 * negotiate a language i18next cannot resolve. A `Content-Language` header that lies is worse than
 * the language being unavailable.
 *
 * See: docs/tools/i18n.md#which-languages-exist
 */
export const listSupportedLocales = (): string[] => {
    if (supportedLocalesCache) return supportedLocalesCache;

    const declared = process.env.NODE_SUPPORTED_LOCALES?.split(',')
        .map((locale) => locale.trim())
        .filter(Boolean);

    // The env var wins when set; otherwise the directory listing IS the declaration.
    supportedLocalesCache =
        declared?.length && declared.length > 0
            ? declared
            : readdirSync(LOCALES_DIRECTORY)
                  .filter((fileName) => fileName.endsWith('.json'))
                  .map((fileName) => path.basename(fileName, '.json'))
                  .toSorted();

    return supportedLocalesCache;
};

/**
 * Drops the cached list so the next call re-reads the environment and the directory.
 *
 * For tests that change `NODE_SUPPORTED_LOCALES` — nothing in the running service should need it,
 * because a locale added after boot is not resolvable until `i18next.init()` runs again.
 */
export const resetSupportedLocales = (): void => {
    supportedLocalesCache = undefined;
};

/**
 * Directories contributing dictionaries on top of the shared one, in registration order.
 *
 * A module owns its own copy — delete the folder and its strings go with it — but `infrastructure` sits below
 * every module and cannot import one to find them. So the paths are handed in at boot, the same
 * inversion `registerAuditSink` uses. Unregistered is a valid state: unit tests that read a
 * dictionary without booting the app get the shared keys and nothing else.
 */
let localeDirectories: string[] = [];

/**
 * Declare which directories contribute dictionaries, replacing any previous set.
 *
 * Must run BEFORE `i18next.init()`, because `loadLocaleResources()` is what init reads and it
 * resolves through here. `app.ts` calls it with the enabled modules' `locales` paths.
 *
 * @param directories - absolute paths, each expected to hold `<locale>.json` files
 */
export const registerLocaleDirectories = (directories: string[]): void => {
    localeDirectories = [...directories];
};

/** Read one dictionary file, or `undefined` when that directory does not carry the language. */
const readDictionaryFile = (
    directory: string,
    locale: string
): Record<string, unknown> | undefined => {
    const file = path.join(directory, `${locale}.json`);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
};

/**
 * Merge `source` into `target`, descending into plain objects.
 *
 * Deep rather than shallow because two modules can legitimately contribute to the same top-level
 * namespace — `account` and `users` both write under keys the other does not — and a shallow
 * assign would let whichever loaded last erase the other's half.
 */
const deepMerge = (
    target: Record<string, unknown>,
    source: Record<string, unknown>
): Record<string, unknown> => {
    // Two objects recurse; anything else (string, array, mismatch) is a leaf the source replaces.
    for (const [key, value] of Object.entries(source)) {
        const existing = target[key];
        target[key] =
            isPlainObject(existing) && isPlainObject(value)
                ? deepMerge({ ...existing }, value)
                : value;
    }
    return target;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One language's dictionary: the shared keys plus every registered module's contribution, layered
 * on top — so a module CAN shadow a shared key. Nothing does, and
 * `tests/cross-cutting/locale-namespaces.test.ts` fails if one starts.
 *
 * Exported for `GET /locales/:locale`, so that endpoint sees the merged result too.
 */
export const readLocaleDictionary = (locale: string): Record<string, unknown> => {
    // Shared file first, module contributions layered on top — hence a module CAN shadow a key.
    const merged = JSON.parse(
        readFileSync(path.join(LOCALES_DIRECTORY, `${locale}.json`), 'utf8')
    ) as Record<string, unknown>;

    // Registration order decides who wins a collision, which is why nothing is allowed to collide.
    for (const directory of localeDirectories) {
        const contribution = readDictionaryFile(directory, locale);
        if (contribution) deepMerge(merged, contribution);
    }

    return merged;
};

/**
 * Every supported dictionary in i18next's `resources` shape, ready for `init()`.
 */
export const loadLocaleResources = (): Resource =>
    Object.fromEntries(
        listSupportedLocales().map((locale) => [
            locale,
            { translation: readLocaleDictionary(locale) }
        ])
    );

/*
 * ── Database overrides ───────────────────────────────────────────────────────────────────────
 * The files above are DEFAULTS; admin edits overlay them. Three properties this layer keeps:
 * nothing here is awaited on the request path, a refresh restores the file baseline BEFORE
 * re-applying, and only a language with a file can be overridden.
 *
 * See: docs/tools/i18n.md#database-overrides
 */

/**
 * Supplies the current overrides, keyed by locale, already nested.
 *
 * Nested rather than flat because the rows are flat and only the `locales` module knows how to
 * expand a dotted key safely — that expansion refuses `__proto__` and reports a key that is both a
 * string and a group, neither of which `infrastructure` should be reimplementing.
 *
 * Registered from the composition root for the same reason {@link registerLocaleDirectories} is:
 * `infrastructure` sits below every module and may not import one.
 */
export type LocaleOverrideProvider = () => Promise<Record<string, Record<string, unknown>>>;

let overrideProvider: LocaleOverrideProvider | undefined;

/**
 * Declare where overrides come from, replacing any previous provider.
 *
 * Unregistered is a valid state and the default one: unit tests that resolve a key without booting
 * the app get the deployed files and nothing else.
 */
export const registerLocaleOverrideProvider = (provider?: LocaleOverrideProvider): void => {
    overrideProvider = provider;
};

/**
 * Restore every supported language to its deployed files, dropping any applied override.
 *
 * The path a failed refresh does NOT take — a provider that throws leaves the last good overlay in
 * place, because stale copy beats copy that reverts itself every time Mongo hiccups. This exists
 * for shutdown and for tests, which need a clean instance rather than a plausible one.
 */
export const resetLocaleOverrides = (): void => {
    for (const locale of listSupportedLocales())
        i18next.addResourceBundle(locale, 'translation', readLocaleDictionary(locale), true, true);
};

/**
 * Re-apply the file baseline and layer the current overrides on top of it.
 *
 * `deep` and `overwrite` are both on: an override names one leaf, and the other keys of its
 * namespace must survive the merge.
 *
 * @param overridesByLocale - nested override trees, keyed by locale
 */
export const applyLocaleOverrides = (
    overridesByLocale: Record<string, Record<string, unknown>>
): void => {
    const supported = new Set(listSupportedLocales());

    /*
     * EVERY supported language is restored, not only the ones this call carries overrides for —
     * otherwise deleting the last override of a language would restore nothing and change nothing.
     *
     * Synchronous to the end of the loop below, so nothing observes a language briefly back on its
     * file.
     */
    resetLocaleOverrides();

    const skipped: string[] = [];

    for (const [locale, overrides] of Object.entries(overridesByLocale)) {
        if (!supported.has(locale)) {
            skipped.push(locale);
            continue;
        }

        i18next.addResourceBundle(locale, 'translation', overrides, true, true);
    }

    if (skipped.length > 0)
        logger.warn(
            'applyLocaleOverrides - overrides stored for languages this API cannot answer',
            {
                detail: `no dictionary file is deployed for ${skipped.join(', ')}; rows ignored`
            }
        );
};

/**
 * Pull the current overrides and apply them. Never rejects.
 *
 * Swallowing the failure is the whole point: this runs at boot, on a timer and after every admin
 * write, and none of those callers has a user to report to. A database that cannot be read costs
 * the overrides and nothing else.
 */
export const refreshLocaleOverrides = (): Promise<void> => {
    if (!overrideProvider) return Promise.resolve();

    return overrideProvider()
        .then((overrides) => applyLocaleOverrides(overrides))
        .catch((error: unknown) => {
            logger.warn(
                'refreshLocaleOverrides - locale overrides unavailable, keeping the last set',
                {
                    detail: error instanceof Error ? error.message : String(error)
                }
            );
        });
};

/** How long a worker may serve copy edited by another worker. */
export const getOverrideRefreshMs = (): number => {
    const configured = Number.parseInt(process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
};

let refreshTimer: NodeJS.Timeout | undefined;

/**
 * Start re-reading the overrides on an interval, so an edit made on one worker reaches the others.
 *
 * `unref` so the timer never holds the process open — a worker with nothing left to do must exit,
 * and a pending copy refresh is not a reason to stay.
 */
export const startLocaleOverrideRefresh = (): void => {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => void refreshLocaleOverrides(), getOverrideRefreshMs());
    refreshTimer.unref();
};

/** Stop the interval. Called by the shutdown path and by tests. */
export const stopLocaleOverrideRefresh = (): void => {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
};

/**
 * What a request carries: the negotiated locale and a `t` bound to it.
 */
export interface LocaleContext {
    locale: string;
    t: TFunction;
}

const localeStorage = new AsyncLocalStorage<LocaleContext>();

/**
 * A `t` bound to one language, touching no global and no ambient store.
 *
 * The primitive the rest of this file is built on, and the one to reach for when the language is
 * known but the caller is not on the request's async chain: `emails.ts` builders resolving copy
 * for a recipient whose language is not the requester's, for instance.
 */
export const translator = (locale: string): TFunction => i18next.getFixedT(locale);

/**
 * Binds a `t` to one language without touching the global instance.
 */
export const createLocaleContext = (locale: string): LocaleContext => ({
    locale,
    t: translator(locale)
});

/**
 * Runs `callback` — and everything it awaits, however deep — with `context` as the ambient locale.
 */
export const runWithLocaleContext = <T>(context: LocaleContext, callback: () => T): T =>
    localeStorage.run(context, callback);

/**
 * Convenience wrapper for code that has a locale string rather than a context: workers draining a
 * queue, jobs acting on a user's behalf, tests.
 */
export const runWithLocale = <T>(locale: string, callback: () => T): T =>
    runWithLocaleContext(createLocaleContext(locale), callback);

/**
 * The ambient context, or `undefined` outside a request.
 */
export const getLocaleContext = (): LocaleContext | undefined => localeStorage.getStore();

/**
 * The locale in effect right now: the request's, or the instance's boot language.
 */
export const getCurrentLocale = (): string =>
    localeStorage.getStore()?.locale ??
    (i18next.language as string | undefined) ??
    getDefaultLocale();

/**
 * Picks the best supported locale for an `Accept-Language` header.
 *
 * Honours q-weights (`it;q=0.9,en;q=0.8`), matches a region tag against its base language
 * (`en-GB` → `en`), treats `*` as "anything, so give me the default", and falls back to
 * `NODE_FALLBACK_LOCALE` when nothing matches — never throwing on a malformed header, because the
 * header is client-supplied and an unparseable one is not worth a 400.
 */
export const negotiateLocale = (
    acceptLanguage?: string,
    supported: string[] = listSupportedLocales()
): string => {
    const fallback = supported.includes(getFallbackLocale())
        ? getFallbackLocale()
        : (supported[0] ?? getFallbackLocale());

    if (!acceptLanguage) return fallback;

    const lowercaseSupported = new Map(supported.map((locale) => [locale.toLowerCase(), locale]));

    const candidates = acceptLanguage
        .split(',')
        .map((part, index) => {
            const [tag = '', ...parameters] = part.trim().split(';');
            const declared = parameters
                .map((parameter) => /^\s*q=(.*)$/i.exec(parameter))
                .find(Boolean)?.[1];
            // An unparseable weight is treated as no weight at all rather than as a rejection:
            // the client still named a language, and a typo in the metadata is no reason to
            // ignore it. `q=0` is different — that is the client explicitly refusing the tag,
            // so it parses to 0 and gets filtered out below.
            const quality = declared === undefined ? 1 : Number.parseFloat(declared);
            return {
                tag: tag.trim().toLowerCase(),
                quality: Number.isNaN(quality) ? 1 : quality,
                index
            };
        })
        .filter(({ tag, quality }) => tag.length > 0 && quality > 0)
        // stable: equal weights keep header order, which is the client's own preference order
        .toSorted((left, right) => right.quality - left.quality || left.index - right.index);

    for (const { tag } of candidates) {
        if (tag === '*') return fallback;
        const exact = lowercaseSupported.get(tag);
        if (exact) return exact;
        const base = lowercaseSupported.get(tag.split('-')[0] ?? '');
        if (base) return base;
    }

    return fallback;
};

/**
 * The ambient `t`.
 *
 * Reads the request's bound `t` when there is one and the global instance's otherwise. Same
 * signature as `i18next`'s own `t`, so repointing an import is the whole migration — the cast is
 * unavoidable because `TFunction` is a union of overloads that no single arrow can satisfy
 * structurally, and it is safe because the arguments are forwarded untouched.
 */
export const t = ((...arguments_: Parameters<TFunction>) =>
    (localeStorage.getStore()?.t ?? i18next.t)(...arguments_)) as TFunction;
