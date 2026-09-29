/**
 * The 415 guard, driven with real express request objects — `request.is` is express's own, so the
 * media-type matching under test is the one production runs.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { requireDeclaredContentType } from '@infrastructure/http/middlewares/content-type';

/** A table with one JSON-only route, one that also takes merge-patch, and a static-vs-param pair. */
const TABLE = {
    'POST /things': ['application/json'],
    'PATCH /things/{id}': ['application/json', 'application/merge-patch+json'],
    'POST /things/search': ['application/x-www-form-urlencoded'],
    'POST /things/{id}/restore': ['application/json']
};

/** What one call needs to say about the request it stands in for. */
interface Sent {
    method: string;
    path: string;
    /** The `Content-Type` header; absent when the client sent none. */
    type?: string;
    /** The `Content-Length`; `0` is a request with a header and no bytes. */
    length?: number;
}

/**
 * Runs the guard once and reports what it did.
 *
 * @param sent - the request to stand in for
 * @returns the status it answered, or `undefined` when it let the request through
 */
const run = (sent: Sent): { status?: number; body?: unknown; passed: boolean } => {
    // `path` is a getter on express's prototype, so it is redefined on the instance, not assigned.
    const request = Object.defineProperties(Object.create(express.request) as Request, {
        method: { value: sent.method },
        path: { value: sent.path },
        headers: {
            value: {
                ...(sent.type ? { 'content-type': sent.type } : {}),
                'content-length': String(sent.length ?? 5)
            }
        }
    });
    const outcome: { status?: number; body?: unknown; passed: boolean } = { passed: false };
    const response = asStub<Response>({
        status: (code: number) => {
            outcome.status = code;
            return response;
        },
        json: (body: unknown) => {
            outcome.body = body;
            return response;
        }
    });

    requireDeclaredContentType(TABLE)(request, response, () => {
        outcome.passed = true;
    });
    return outcome;
};

describe('requireDeclaredContentType', () => {
    it('lets a declared type through', () => {
        expect(run({ method: 'POST', path: '/things', type: 'application/json' }).passed).toBe(
            true
        );
    });

    it('answers 415 for a type the operation does not declare, naming the accepted ones', () => {
        const outcome = run({ method: 'POST', path: '/things', type: 'text/plain' });

        expect(outcome.status).toBe(415);
        expect(outcome.body).toMatchObject({
            errors: [
                {
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    details: { accepted: ['application/json'] }
                }
            ]
        });
        expect(outcome.passed).toBe(false);
    });

    it('accepts merge-patch on a PATCH that declares it', () => {
        const outcome = run({
            method: 'PATCH',
            path: '/things/abc',
            type: 'application/merge-patch+json'
        });

        expect(outcome.passed).toBe(true);
    });

    it('refuses merge-patch on an operation that does not declare it', () => {
        const outcome = run({
            method: 'POST',
            path: '/things',
            type: 'application/merge-patch+json'
        });

        expect(outcome.status).toBe(415);
    });

    it('does not judge a request with no bytes, even one that names a type', () => {
        const outcome = run({
            method: 'POST',
            path: '/things/abc/restore',
            type: 'text/plain',
            length: 0
        });

        expect(outcome.passed).toBe(true);
    });

    it('matches the static path before the parameter one', () => {
        const outcome = run({
            method: 'POST',
            path: '/things/search',
            type: 'application/x-www-form-urlencoded'
        });

        expect(outcome.passed).toBe(true);
    });

    it('ignores a trailing slash', () => {
        expect(run({ method: 'POST', path: '/things/', type: 'text/plain' }).status).toBe(415);
    });

    it('leaves a route the table does not know alone', () => {
        expect(run({ method: 'POST', path: '/elsewhere', type: 'text/plain' }).passed).toBe(true);
    });
});
