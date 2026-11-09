/**
 * The JSON shape guard: only a parsed JSON body that is not an object is refused, with a 422.
 */

import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { requireJsonObjectBody } from '@infrastructure/http/middlewares/json-object';

/** Runs the middleware on a body and reports what it did. */
const run = (body: unknown, contentType: string | false) => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    const response = asStub<Response>({
        status,
        json,
        setHeader: jest.fn(),
        getHeader: jest.fn(),
        hasHeader: jest.fn(),
        removeHeader: jest.fn()
    });
    requireJsonObjectBody(
        asStub<Request>({ body, is: jest.fn(() => contentType) }),
        response,
        next as NextFunction
    );
    return { status, next };
};

describe('requireJsonObjectBody', () => {
    it.each([[5], ['x'], [true], [null], [[]], [[{ a: 1 }]]])('refuses %j with a 422', (body) => {
        const { status, next } = run(body, 'application/json');

        expect(status).toHaveBeenCalledWith(422);
        expect(next).not.toHaveBeenCalled();
    });

    it('lets an object, including an empty one, through', () => {
        expect(run({}, 'application/json').next).toHaveBeenCalledTimes(1);
        expect(run({ a: [1] }, 'application/merge-patch+json').next).toHaveBeenCalledTimes(1);
    });

    it('lets a request with no parsed body through', () => {
        expect(run(undefined, false).next).toHaveBeenCalledTimes(1);
    });

    it('judges only a JSON body', () => {
        expect(run('plain text', false).next).toHaveBeenCalledTimes(1);
    });
});
