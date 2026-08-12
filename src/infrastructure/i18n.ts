import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';
import type { Resource, TFunction } from 'i18next';

/**
 * Request-scoped i18n.
 *
 * ## Why this module exists
 *
 * `i18next`'s default export is a single global instance with a single active language. Importing
 * `t` from it gives every request the same language, and the only way to change it —
 * `i18next.changeLanguage()` — mutates that global AND is async. Two overlapping requests in
 * different languages interleave and one gets answered in the other's language: a bug that only
 * appears under concurrency, so never in a test and always in production.
 *
 * Instead: `i18next.getFixedT(locale)` returns a `t` bound to one language and touches no global,
 * and an `AsyncLocalStorage` carries it down the request's async chain so a Zod thunk twelve calls
 * deep can reach it without `t` being threaded through twelve signatures.
 *
 * Call sites import `t` from here instead of from `'i18next'` and otherwise keep their shape.
 *
 * ## Boundaries — where the ambient `t` stops working
 *
 * ALS is scoped to an async CALL CHAIN, not to a block or a variable. Anything that leaves the
 * chain leaves the store behind, and `t` silently falls back to the global instance:
 *
 * - **Queued work.** `enqueueEmail` publishes to a queue that `workers/email.worker.ts` drains
 *   later, possibly in another process. The store does not survive that hop — out-of-band work
 *   must carry its locale in the payload and bind its own `t` with {@link runWithLocale}.
 * - **Callbacks registered before the chain started** (module-scope subscriptions, timers set at
 *   boot) run outside any store.
 * - **Jobs, migrations, scripts and tests** have no request at all. The fallback to the global
 *   `i18next.t` is deliberate and is what keeps them working.
 *
 * The fallback never throws and never returns a key: outside a request you get the boot locale.
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
 * The locales this API can answer in.
 *
 * `NODE_SUPPORTED_LOCALES` wins when set (useful to ship a dictionary without exposing it yet);
 * otherwise the directory listing IS the list, so adding `src/locales/xx.json` is the only step
 * needed to add a language. The service runs from source under `tsx` — there is no emit step that
 * could leave the directory behind.
 *
 * **Read once, then cached, and that is load-bearing.** `i18next.init()` registers its
 * `resources` from this list at boot and never revisits them, so a per-request directory read
 * would let the two disagree: drop in `es.json` on a running server and the middleware starts
 * negotiating `es` — answering `Content-Language: es` — while i18next has no Spanish resource and
 * silently serves the fallback. A header that lies is worse than the language being unavailable.
 * Caching makes "what we negotiate" and "what we can actually resolve" the same list, at the cost
 * of a restart to add a locale — which is what a deploy does anyway.
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
 * One language's dictionary: the shared keys, plus every registered module's contribution.
 *
 * Exported for `GET /locales/:locale`, which serves the API's own dictionary to clients that want
 * to render API copy themselves — so that endpoint sees the merged result too, not just the
 * shared half.
 *
 * The shared file is read first and contributions are layered on top, which means a module CAN
 * shadow a shared key. Nothing does, and `tests/cross-cutting/locale-namespaces.test.ts` fails if
 * one starts: a module quietly overriding `generic.error-internal` would change copy the paired
 * frontend also reads.
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

/**
 * What a request carries: the negotiated locale and a `t` bound to it.
 */
export interface ILocaleContext {
    locale: string;
    t: TFunction;
}

const localeStorage = new AsyncLocalStorage<ILocaleContext>();

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
export const createLocaleContext = (locale: string): ILocaleContext => ({
    locale,
    t: translator(locale)
});

/**
 * Runs `callback` — and everything it awaits, however deep — with `context` as the ambient locale.
 */
export const runWithLocaleContext = <T>(context: ILocaleContext, callback: () => T): T =>
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
export const getLocaleContext = (): ILocaleContext | undefined => localeStorage.getStore();

/**
 * The locale in effect right now: the request's, or the instance's boot language.
 */
export const getCurrentLocale = (): string =>
    localeStorage.getStore()?.locale ?? i18next.language ?? getDefaultLocale();

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
