/**
 * Header negotiation: which of the languages this API answers in a client asked for.
 *
 * A pure function over a client-supplied string and the supported list. It reads the catalogue and
 * nothing else — no request, no ambient state — which is why the locale middleware can call it and
 * a test can call it with a list it made up.
 *
 * See: docs/tools/i18n.md
 */

import { getFallbackLocale, listSupportedLocales } from './catalog';

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
