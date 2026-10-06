/**
 * `requireAllowedOrigin` — a request naming a foreign `Origin` is refused before anything runs; one
 * naming an allowed origin, or none at all (curl, a health check, a same-origin navigation), passes.
 */
import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';
import { requireAllowedOrigin } from '@infrastructure/http/middlewares/origin';

/** Runs the guard against a request carrying `origin`, answering what the response and `next` saw. */
const run = (origin: string | undefined) => {
    const next = jest.fn();
    const response = asStub<Response>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn()
    });
    const request = asStub<Request>({
        get: (name: string) => (name === 'Origin' ? origin : undefined)
    });

    requireAllowedOrigin(request, response, asStub<NextFunction>(next));

    return { next, response };
};

beforeEach(() => {
    setEnvironment({ NODE_CORS_ORIGIN: 'https://shop.example,https://admin.example' });
});

describe('requireAllowedOrigin', () => {
    it.each(['https://shop.example', 'https://admin.example'])('lets %s through', (origin) => {
        const { next } = run(origin);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('lets a request with no Origin through: it is not a browser cross-origin call', () => {
        expect(run(undefined).next).toHaveBeenCalledTimes(1);
    });

    it.each([
        'https://evil.example',
        'https://shop.example.evil.example',
        'http://shop.example',
        'null'
    ])('refuses %s with 403 and never calls next', (origin) => {
        const { next, response } = run(origin);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('allows the developer default while the list is unset', () => {
        setEnvironment({ NODE_CORS_ORIGIN: undefined });

        expect(run('http://localhost:8080').next).toHaveBeenCalledTimes(1);
        expect(run('http://localhost:9999').next).not.toHaveBeenCalled();
    });
});
