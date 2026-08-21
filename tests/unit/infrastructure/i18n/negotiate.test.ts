/**
 * Header negotiation.
 *
 * `negotiateLocale` is a pure function over a client-supplied header, so it is tested directly
 * rather than only through the integration suite — malformed headers are the interesting cases
 * and they are tedious to provoke over HTTP.
 */
import { negotiateLocale } from '@infrastructure/i18n';

const SUPPORTED = ['en', 'it'];

describe('negotiateLocale', () => {
    it.each([
        ['it', 'it'],
        ['en', 'en'],
        ['IT', 'it'],
        ['it-CH', 'it'],
        ['en-GB', 'en']
    ])('resolves %s to %s', (header, expected) => {
        expect(negotiateLocale(header, SUPPORTED)).toBe(expected);
    });

    it('prefers the highest q-weight over header order', () => {
        expect(negotiateLocale('en;q=0.8,it;q=0.9', SUPPORTED)).toBe('it');
    });

    it('keeps header order when weights tie', () => {
        expect(negotiateLocale('it;q=0.9,en;q=0.9', SUPPORTED)).toBe('it');
    });

    it('skips unsupported languages and takes the next acceptable one', () => {
        expect(negotiateLocale('de,fr;q=0.9,it;q=0.8', SUPPORTED)).toBe('it');
    });

    it('ignores an entry the client explicitly refused with q=0', () => {
        expect(negotiateLocale('it;q=0,en;q=0.5', SUPPORTED)).toBe('en');
    });

    it.each([
        ['no header at all', undefined],
        ['an empty header', ''],
        ['a wildcard', '*'],
        ['only unsupported languages', 'de,fr'],
        ['punctuation soup', ';;;,,,']
    ])('falls back to the fallback locale given %s', (_label, header) => {
        expect(negotiateLocale(header, SUPPORTED)).toBe('en');
    });

    it('honours a language whose weight is unparseable, rather than discarding it', () => {
        expect(negotiateLocale('it;q=banana', SUPPORTED)).toBe('it');
    });

    it('falls back to the first supported locale when the fallback is not supported', () => {
        expect(negotiateLocale('de', ['it', 'es'])).toBe('it');
    });

    // The default argument is the catalogue, so a caller that names no list negotiates against
    // exactly the languages `i18next.init()` registered.
    it('negotiates against the supported list when given no list', () => {
        expect(negotiateLocale('it')).toBe('it');
    });
});
