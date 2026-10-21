/**
 * @module
 * Which languages this deployment SERVES right now: the one list every part of a request agrees
 * on. A language is served when it is switched on — a deployed dictionary file, or a registered
 * row — and the fallback language always is. A switched-off language is never selected: the
 * negotiation, the emails and the order snapshots all fall back to the default instead.
 *
 * The state is filled by the database overlay's refresh (`./overrides`), never read from Mongo on
 * a request. Until the first refresh lands it is empty, which serves exactly the deployed files.
 *
 * See: docs/tools/i18n.md#one-language-per-request
 */

import { getFallbackLocale, listSupportedLocales } from './catalog';

/** The switched-on and switched-off tags of the registered languages, as of the last good refresh. */
interface ServedLanguages {
    /** Tags of the registered languages that are switched on. */
    active: ReadonlySet<string>;
    /** Tags of the registered languages that are switched off. */
    inactive: ReadonlySet<string>;
}

/** The last good refresh. Replaced as a whole, so a reader never sees half of a new answer. */
let served: ServedLanguages = { active: new Set(), inactive: new Set() };

/**
 * Replace the registered languages' on/off state with the answer of one refresh.
 *
 * @param active - tags of the registered languages that are switched on
 * @param inactive - tags of the registered languages that are switched off
 */
export const setServedLanguages = (
    active: readonly string[],
    inactive: readonly string[]
): void => {
    served = { active: new Set(active), inactive: new Set(inactive) };
};

/** Forget the registered languages: only the deployed files (and the fallback) are served again. */
export const resetServedLanguages = (): void => {
    served = { active: new Set(), inactive: new Set() };
};

/**
 * Every language a request may be answered in: the deployed files minus the switched-off ones,
 * plus the registered languages that are switched on, plus the fallback language, which can be
 * neither switched off nor deleted.
 *
 * The fallback comes FIRST: `negotiator` answers a bare `*` — or no header at all — with the first
 * candidate it is offered, so that is what makes both resolve to the fallback.
 */
export const listServedLocales = (): string[] => {
    const fallback = getFallbackLocale();
    const fromFiles = listSupportedLocales().filter((tag) => !served.inactive.has(tag));
    return [...new Set([fallback, ...fromFiles, ...served.active])];
};

/** Whether the tag is a language a request may be answered in — see {@link listServedLocales}. */
export const isServedLocale = (tag: string): boolean => listServedLocales().includes(tag);

/**
 * Whether the API has its own wording for the tag: a deployed dictionary file, and not switched off.
 * A registered language without a file is served but has no wording of its own, so its messages
 * fall back to the default language key by key.
 */
export const hasServedDictionary = (tag: string): boolean =>
    listSupportedLocales().includes(tag) && !served.inactive.has(tag);

/**
 * The language a request, a mail or a snapshot runs in for a saved or negotiated tag.
 *
 * The tag itself when it is served, or when its base language is (`it-CH` follows `it`: the
 * resolver walks the tag, its base and the fallback). Anything else — unregistered, or switched
 * off, also later than the tag was saved — is the fallback language.
 *
 * @param locale - a BCP-47 tag, possibly regional
 */
export const servedLocaleFor = (locale: string): string =>
    isServedLocale(locale) || isServedLocale(locale.split('-', 1)[0])
        ? locale
        : getFallbackLocale();

/**
 * The language the API's own wording is read in for a tag: the tag when the API has a file for it
 * and it is on, else its base language when that has one, else the fallback language.
 *
 * @param locale - a BCP-47 tag, possibly regional
 */
export const dictionaryLocaleFor = (locale: string): string => {
    if (hasServedDictionary(locale)) return locale;
    const base = locale.split('-', 1)[0];
    return hasServedDictionary(base) ? base : getFallbackLocale();
};
