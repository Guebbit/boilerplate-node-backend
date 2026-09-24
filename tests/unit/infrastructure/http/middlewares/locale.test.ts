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
import { asStub } from '@tests/stub';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { attachLocale } from '@infrastructure/http/middlewares/locale';
import {
    getCurrentLocale,
    getFallbackLocale,
    getLocaleContext,
    listSupportedLocales
} from '@infrastructure/i18n';

/**
 * A request whose `acceptsLanguages` is the REAL Express implementation (`accepts`/`negotiator`
 * under it), not a hand-rolled stand-in — `Object.create(express.request)` picks up every method
 * on the prototype the framework itself serves requests through, headers included.
 */
const makeRequest = (acceptLanguage?: string) =>
    asStub<Request>(
        Object.assign(Object.create(express.request) as Request, {
            headers: acceptLanguage === undefined ? {} : { 'accept-language': acceptLanguage }
        })
    );

const makeResponse = () =>
    asStub<Response & { set: jest.Mock; vary: jest.Mock }>({
        set: jest.fn(),
        vary: jest.fn()
    });

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

    it.each([
        ['it', 'it'],
        ['IT', 'it'],
        ['it-CH', 'it'],
        ['en-GB', 'en']
    ])('resolves %s to %s', (header, expected) => {
        const request = makeRequest(header);

        attachLocale(request, makeResponse(), jest.fn() as NextFunction);

        expect(request.locale).toBe(expected);
    });

    it('prefers the highest q-weight over header order', () => {
        const request = makeRequest('en;q=0.8,it;q=0.9');

        attachLocale(request, makeResponse(), jest.fn() as NextFunction);

        expect(request.locale).toBe('it');
    });

    it('ignores an entry the client explicitly refused with q=0', () => {
        const request = makeRequest('it;q=0,en;q=0.5');

        attachLocale(request, makeResponse(), jest.fn() as NextFunction);

        expect(request.locale).toBe('en');
    });

    /**
     * The two behaviour deltas from `acceptsLanguages` (`accepts`/`negotiator`, Express's own
     * negotiator) versus a hand-rolled parser. Both are deliberate trade-offs, not regressions —
     * the cases below assert the chosen behaviour, not merely describe it.
     */
    describe('behaviour deltas from the hand-rolled parser', () => {
        it('drops a tag with an unparseable q-weight, rather than treating it as full weight', () => {
            // Old `negotiateLocale`: an unparseable weight ('banana') fell back to full weight, so
            // 'it' won. `negotiator` drops the tag outright instead, so the request falls through
            // to the fallback locale.
            const request = makeRequest('it;q=banana');

            attachLocale(request, makeResponse(), jest.fn() as NextFunction);

            expect(request.locale).not.toBe('it');
            expect(request.locale).toBe(getFallbackLocale());
        });

        it('resolves a bare wildcard to the fallback locale, same as before', () => {
            // Old `negotiateLocale` special-cased '*' to mean "give me the default". `negotiator`
            // instead returns the first candidate OFFERED for a wildcard — `attachLocale` orders
            // the fallback first specifically so this still lands on the same answer.
            const request = makeRequest('*');

            attachLocale(request, makeResponse(), jest.fn() as NextFunction);

            expect(request.locale).toBe(getFallbackLocale());
        });
    });
});
