/**
 * `attachLocale` — `src/infrastructure/http/middlewares/locale.ts`.
 *
 * The middleware does four separable things, and each one breaks a different consumer:
 *
 *   - it **negotiates** the locale from `Accept-Language` and puts it on the request, which is
 *     what `request.t` and every ambient `t()` downstream read;
 *   - it runs `next` **inside** the locale context, which is the whole mechanism — a service that
 *     imports `t` from `@infrastructure/i18n` gets the request's language only because it executes within
 *     this call. Hoisting `next()` out of `runWithLocaleContext` leaves `request.t` correct and
 *     every ambient `t()` silently falling back to English;
 *   - it states what the client actually got in `Content-Language`, which is not always what was
 *     asked for;
 *   - it appends `Vary: Accept-Language` so a shared cache does not answer an Italian request
 *     with the English body it stored a moment earlier.
 *
 * The last two are asserted for the append, not the assignment: `response.vary` must add to
 * whatever CORS already put there rather than replace it.
 */
import type { NextFunction, Request, Response } from 'express';
import { attachLocale } from '@infrastructure/http/middlewares/locale';
import { getCurrentLocale, getLocaleContext, listSupportedLocales } from '@infrastructure/i18n';

const makeRequest = (acceptLanguage?: string) =>
    ({
        get: (name: string) =>
            name.toLowerCase() === 'accept-language' ? acceptLanguage : undefined
    }) as unknown as Request;

const makeResponse = () =>
    ({
        set: jest.fn(),
        vary: jest.fn()
    }) as unknown as Response & { set: jest.Mock; vary: jest.Mock };

describe('attachLocale', () => {
    it('puts the negotiated locale and its bound t on the request', () => {
        const request = makeRequest('it');
        const response = makeResponse();

        attachLocale(request, response, jest.fn() as NextFunction);

        expect(request.locale).toBe('it');
        expect(typeof request.t).toBe('function');
    });

    it('runs next inside the locale context, not merely alongside it', () => {
        // This is the assertion that the ambient `t` depends on. `getCurrentLocale()` reads the
        // AsyncLocalStorage store, so it can only see 'it' if `next` executes within
        // `runWithLocaleContext` — calling next() before or after would leave it at the default.
        const request = makeRequest('it');
        let seenInsideNext: string | undefined;
        let contextInsideNext: unknown;

        attachLocale(request, makeResponse(), (() => {
            seenInsideNext = getCurrentLocale();
            contextInsideNext = getLocaleContext();
        }) as NextFunction);

        expect(seenInsideNext).toBe('it');
        expect(contextInsideNext).toBeDefined();
    });

    it('leaves no locale context behind once the chain returns', () => {
        attachLocale(makeRequest('it'), makeResponse(), jest.fn() as NextFunction);

        expect(getLocaleContext()).toBeUndefined();
    });

    it('states the locale the client actually got, not the one it asked for', () => {
        // 'zz' is supported by nothing, so negotiation falls back — and the header has to say so,
        // otherwise a cache keys an English body under a Klingon request.
        const request = makeRequest('zz');
        const response = makeResponse();

        attachLocale(request, response, jest.fn() as NextFunction);

        expect(listSupportedLocales()).toContain(request.locale);
        expect(response.set).toHaveBeenCalledWith('Content-Language', request.locale);
    });

    it('varies on Accept-Language so a shared cache cannot cross languages', () => {
        const response = makeResponse();

        attachLocale(makeRequest('en'), response, jest.fn() as NextFunction);

        // `vary` rather than `set`: it appends, so CORS's `Vary: Origin` survives.
        expect(response.vary).toHaveBeenCalledWith('Accept-Language');
    });

    it('falls back rather than throwing on a header the client made up', () => {
        const request = makeRequest(';;;q=notanumber,');
        const response = makeResponse();

        expect(() => attachLocale(request, response, jest.fn() as NextFunction)).not.toThrow();
        expect(listSupportedLocales()).toContain(request.locale);
    });

    it('calls next exactly once', () => {
        const next = jest.fn();

        attachLocale(makeRequest('en'), makeResponse(), next as NextFunction);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
