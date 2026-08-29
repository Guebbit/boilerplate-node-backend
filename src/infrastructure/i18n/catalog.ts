/**
 * Where translations come from: discovery, the per-module merge, and the resources `i18next.init()`
 * is handed at boot.
 *
 * Files only. The database overlay is `./overrides`, which layers on top of what this produces —
 * one direction, never back. A project that changes where dictionaries live edits this file and
 * nothing else, and in particular does not touch the request-scoped `t` that 36 files import.
 *
 * See: docs/tools/i18n.md
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Resource } from 'i18next';

/**
 * Where the shared dictionaries live. Resolved from this file rather than from `process.cwd()`, so
 * it is the same directory whether the entry point is `src/cluster.ts`, a Jest worker or a
 * migration.
 */
const LOCALES_DIRECTORY = path.join(__dirname, '..', '..', 'locales');

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
    supportedLocalesCache = declared?.length
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
