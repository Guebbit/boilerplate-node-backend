/**
 * The JSON depth guard: what counts as too deep, that checking it cannot overflow the stack, and
 * that only a JSON body is judged.
 */

import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import {
    MAX_JSON_DEPTH,
    exceedsDepth,
    limitJsonDepth
} from '@infrastructure/http/middlewares/json-depth';

/** `levels` nested arrays around a leaf: `[[[1]]]` is 3. */
const nestedArrays = (levels: number): unknown =>
    JSON.parse(`${'['.repeat(levels)}1${']'.repeat(levels)}`);

/** Runs the middleware on a body and reports what it did. */
const run = (body: unknown, contentType: string | false) => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    const response = asStub<Response>({ status, json });
    limitJsonDepth(
        asStub<Request>({ body, is: jest.fn(() => contentType) }),
        response,
        next as NextFunction
    );
    return { status, json, next };
};

describe('exceedsDepth', () => {
    it('allows a body nested exactly to the limit and refuses one level past it', () => {
        expect(exceedsDepth(nestedArrays(MAX_JSON_DEPTH), MAX_JSON_DEPTH)).toBe(false);
        expect(exceedsDepth(nestedArrays(MAX_JSON_DEPTH + 1), MAX_JSON_DEPTH)).toBe(true);
    });

    it('counts objects and arrays together', () => {
        let body: unknown = 1;
        for (let level = 0; level < MAX_JSON_DEPTH + 1; level += 1)
            body = level % 2 === 0 ? { a: body } : [body];

        expect(exceedsDepth(body, MAX_JSON_DEPTH)).toBe(true);
    });

    it('does not count a leaf, and finds depth in a late sibling', () => {
        expect(exceedsDepth({ a: 1, b: 'x', c: null }, 1)).toBe(false);
        expect(exceedsDepth({ first: 1, last: nestedArrays(MAX_JSON_DEPTH) }, MAX_JSON_DEPTH)).toBe(
            true
        );
    });

    // The reason it is iterative: a recursive walk throws RangeError on this.
    it('walks a body 50,000 levels deep without overflowing the stack', () => {
        expect(exceedsDepth(nestedArrays(50_000), MAX_JSON_DEPTH)).toBe(true);
    });

    it('treats a bare scalar and an empty container as shallow', () => {
        expect(exceedsDepth(5, 0)).toBe(false);
        expect(exceedsDepth(null, 0)).toBe(false);
        expect(exceedsDepth([], 1)).toBe(false);
    });
});

describe('limitJsonDepth', () => {
    it('answers 400 BAD_REQUEST with the reason, and never calls next', () => {
        const { status, json, next } = run(nestedArrays(MAX_JSON_DEPTH + 1), 'application/json');

        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [
                    expect.objectContaining({
                        code: 'BAD_REQUEST',
                        details: { reason: 'body-too-deep', maxDepth: MAX_JSON_DEPTH }
                    })
                ]
            })
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('passes a body within the limit through', () => {
        const { next, status } = run({ a: { b: [1, 2] } }, 'application/json');

        expect(next).toHaveBeenCalledWith();
        expect(status).not.toHaveBeenCalled();
    });

    it('does not judge a body that is not JSON', () => {
        const { next } = run(nestedArrays(MAX_JSON_DEPTH + 5), false);

        expect(next).toHaveBeenCalledWith();
    });
});
