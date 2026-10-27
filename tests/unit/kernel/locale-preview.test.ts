/**
 * `previewDraftLanguage` — `src/kernel/middlewares/locale-preview.ts`.
 *
 * It re-binds a request to a draft language in exactly one situation: the caller's FIRST
 * `Accept-Language` choice is a switched-off language AND the translation port says the caller
 * may read drafts. Every other path must leave the live pick `attachLocale` made untouched.
 */
import { asStub } from '@tests/stub';
import type { NextFunction, Request, Response } from 'express';
import { previewDraftLanguage } from '@kernel/middlewares/locale-preview';
import { registerTranslationPort, type TranslationPort } from '@kernel/translation';
import { getLocaleContext, resetServedLanguages, setServedLanguages } from '@infrastructure/i18n';
import { isDraftPreview } from '@infrastructure/http/middlewares/cache';
import type { Caller } from '@types';

/** A caller the port double answers for; the middleware only hands it on. */
const STAFF = asStub<Caller>({ id: 'staff' });

/** A port double: only `canPreviewDrafts` matters to the middleware. */
const portAllowing = (allowed: boolean): TranslationPort =>
    asStub<TranslationPort>({ canPreviewDrafts: (caller?: Caller) => allowed && caller === STAFF });

/**
 * Runs the middleware against a request asking for the ranges given, and reports what it did.
 *
 * @param ranges - what `request.acceptsLanguages()` answers, best first
 * @param caller - `request.caller`
 */
const run = (ranges: string[], caller: Caller | null = STAFF) => {
    const headers: Record<string, string> = {};
    const request = asStub<Request>({
        locale: 'en',
        caller: caller ?? undefined,
        headers: {},
        acceptsLanguages: () => ranges
    });
    const response = asStub<Response>({
        locals: {},
        set: (name: string, value: string) => {
            headers[name.toLowerCase()] = value;
        },
        vary: jest.fn()
    });
    let inside: ReturnType<typeof getLocaleContext>;
    const next: NextFunction = () => {
        inside = getLocaleContext();
    };

    previewDraftLanguage(request, response, next);

    return { request, response, headers, inside: () => inside };
};

beforeEach(() => {
    setServedLanguages(['fr'], ['de']);
    registerTranslationPort(portAllowing(true));
});

afterEach(() => {
    registerTranslationPort(undefined);
    resetServedLanguages();
});

describe('previewDraftLanguage', () => {
    it('re-binds a caller who may read drafts to the draft language they asked for first', () => {
        const { request, response, headers, inside } = run(['de', 'en']);

        expect(request.locale).toBe('de');
        expect(headers['content-language']).toBe('de');
        expect(headers['cache-control']).toBe('private, no-store');
        expect(isDraftPreview(response)).toBe(true);
        expect(inside()).toMatchObject({ locale: 'de', preview: true });
    });

    it.each([
        ['a draft behind a live language', ['fr', 'de']],
        ['a wildcard', ['*']],
        ['no header at all', []],
        ['a live language', ['fr']],
        ['a regional tag of the draft', ['de-AT']]
    ])('leaves %s alone', (_label, ranges) => {
        const { request, response, headers, inside } = run(ranges);

        expect(request.locale).toBe('en');
        expect(headers['content-language']).toBeUndefined();
        expect(isDraftPreview(response)).toBe(false);
        expect(inside()?.preview).toBeUndefined();
    });

    it('leaves an anonymous caller alone, answering the live pick', () => {
        const { request, response } = run(['de'], null);

        expect(request.locale).toBe('en');
        expect(isDraftPreview(response)).toBe(false);
    });

    it('leaves a caller who may not read drafts alone', () => {
        registerTranslationPort(portAllowing(false));

        const { request, response } = run(['de']);

        expect(request.locale).toBe('en');
        expect(isDraftPreview(response)).toBe(false);
    });

    it('does nothing when no translation port is registered (locales uninstalled)', () => {
        registerTranslationPort(undefined);

        const { request, response } = run(['de']);

        expect(request.locale).toBe('en');
        expect(isDraftPreview(response)).toBe(false);
    });
});
