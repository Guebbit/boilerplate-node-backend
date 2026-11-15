/**
 * @module
 * Which languages this deployment SERVES right now: the one list every part of a request agrees
 * on. A language is served when it is switched on — a deployed dictionary file, or a registered
 * row — and the fallback language always is. A switched-off language is never selected: the
 * negotiation, the emails and the order snapshots are all answered in the fallback language instead.
 *
 * The state is filled by the database overlay's refresh (`./overrides`), never read from Mongo on
 * a request. Until the first refresh lands it is empty, which serves exactly the deployed files.
 *
 * See: docs/understand/i18n.md#one-language-per-request
 */

import { getFallbackLocale, listSupportedLocales } from './catalog';
import { baseLanguage, canonicalLocale } from './locale-tag';

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

/**
 * The registered draft a client's tag names: a language that is switched off (a deployed file the
 * shop switched off included), never the fallback. Case-blind (the tag is canonicalised), but the exact tag otherwise:
 * a regional tag is not its base language's draft.
 *
 * @param tag - a BCP-47 tag as a client sent it
 * @returns the registered spelling of the draft, or `undefined` when the tag is not a draft
 */
export const draftLocaleFor = (tag: string): string | undefined => {
    const wanted = canonicalLocale(tag);
    return [...served.inactive].find((draft) => draft === wanted && draft !== getFallbackLocale());
};

/**
 * Whether the tag is a language a request may be answered in — see {@link listServedLocales}.
 * The tag is compared in its canonical form, so `pt-br` and `pt-BR` are one answer.
 */
export const isServedLocale = (tag: string): boolean =>
    listServedLocales().includes(canonicalLocale(tag));

/**
 * Whether the API has its own wording for the tag: a deployed dictionary file, and not switched off.
 * A registered language without a file is served but has no wording of its own, so its messages
 * come from the fallback language key by key.
 */
export const hasServedDictionary = (tag: string): boolean => {
    const canonical = canonicalLocale(tag);
    return listSupportedLocales().includes(canonical) && !served.inactive.has(canonical);
};

/**
 * The language a request, a mail or a snapshot runs in for a saved or negotiated tag.
 *
 * The tag itself when it is served, or when its base language is (`it-CH` follows `it`: the
 * resolver walks the tag, its base and the fallback). Anything else — unregistered, or switched
 * off, also later than the tag was saved — is the fallback language.
 *
 * @param locale - a BCP-47 tag, possibly regional
 */
export const servedLocaleFor = (locale: string): string => {
    const canonical = canonicalLocale(locale);
    return isServedLocale(canonical) || isServedLocale(baseLanguage(canonical))
        ? canonical
        : getFallbackLocale();
};

/**
 * The language the API's own wording is read in for a tag: the tag when the API has a file for it
 * and it is on, else its base language when that has one, else the fallback language.
 *
 * @param locale - a BCP-47 tag, possibly regional
 */
export const dictionaryLocaleFor = (locale: string): string => {
    const canonical = canonicalLocale(locale);
    if (hasServedDictionary(canonical)) return canonical;
    const base = baseLanguage(canonical);
    return hasServedDictionary(base) ? base : getFallbackLocale();
};
