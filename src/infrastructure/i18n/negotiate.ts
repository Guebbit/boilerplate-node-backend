/**
 * @module
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
 * Honours q-weights, matches a region tag against its base language (`en-GB` → `en`), treats `*`
 * as "give me the default", and falls back to `NODE_FALLBACK_LOCALE` on no match — never throwing
 * on a malformed header, since it's client-supplied and not worth a 400.
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
            // Unparseable weight (a metadata typo) falls back to full weight rather than
            // rejecting the tag; `q=0` is different — that's an explicit refusal, parsed as 0.
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
