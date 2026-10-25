/**
 * The 405 guard, driven with real express request objects over a small path table.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import type { OperationRoute } from '@api/operation-routes';
import { methodNotAllowed } from '@infrastructure/http/middlewares/method-not-allowed';

/** A static-vs-param pair, a read-only path, a path of a module this build does not serve, a system route. */
const TABLE: readonly OperationRoute[] = [
    { pattern: /^\/things$/, parameterCount: 0, module: 'things', methods: ['GET', 'POST'] },
    { pattern: /^\/things\/search$/, parameterCount: 0, module: 'things', methods: ['POST'] },
    {
        pattern: /^\/things\/[^/]+$/,
        parameterCount: 1,
        module: 'things',
        methods: ['DELETE', 'PATCH', 'PUT']
    },
    { pattern: /^\/ghosts$/, parameterCount: 0, module: 'ghosts', methods: ['GET'] },
    { pattern: /^\/ping$/, parameterCount: 0, module: null, methods: ['GET'] }
];

/** What the guard did with one request. */
interface Outcome {
    status?: number;
    allow?: string;
    passed: boolean;
}

/**
 * Runs the guard once.
 *
 * @param method - the request method
 * @param path - the request path
 * @returns the status and `Allow` it answered with, or `passed` when it let the request on
 */
const run = (method: string, path: string): Outcome => {
    // `path` is a getter on express's prototype, so it is redefined on the instance, not assigned.
    const request = Object.defineProperties(Object.create(express.request) as Request, {
        method: { value: method },
        path: { value: path }
    });
    const outcome: Outcome = { passed: false };
    const response = asStub<Response>({
        setHeader: (name: string, value: string) => {
            if (name === 'Allow') outcome.allow = value;
        },
        getHeader: () => undefined,
        removeHeader: () => undefined,
        status: (code: number) => {
            outcome.status = code;
            return response;
        },
        json: () => response
    });

    methodNotAllowed(TABLE, new Set(['things']))(request, response, () => {
        outcome.passed = true;
    });
    return outcome;
};

describe('methodNotAllowed', () => {
    it('answers 405 with the sorted Allow list, HEAD added beside GET', () => {
        expect(run('DELETE', '/things')).toMatchObject({
            status: 405,
            allow: 'GET, HEAD, POST',
            passed: false
        });
    });

    it('lets a declared method through, and HEAD wherever GET is declared', () => {
        expect(run('POST', '/things').passed).toBe(true);
        expect(run('HEAD', '/things').passed).toBe(true);
    });

    it('lets OPTIONS through: the CORS layer answers it, not a route', () => {
        expect(run('OPTIONS', '/things').passed).toBe(true);
    });

    it('lets an unknown path through to the 404', () => {
        expect(run('DELETE', '/nope').passed).toBe(true);
    });

    it('lets a path of a module this build does not serve through to the 404', () => {
        expect(run('DELETE', '/ghosts').passed).toBe(true);
    });

    it('judges a system route, which has no owning module', () => {
        expect(run('POST', '/ping')).toMatchObject({ status: 405, allow: 'GET, HEAD' });
    });

    it('reads a trailing slash as the same path', () => {
        expect(run('PUT', '/things/').allow).toBe('GET, HEAD, POST');
    });

    it('offers the union of every template a path matches', () => {
        // `/things/search` also reads as `/things/{id}`: the router would give that id to the
        // parameter route, so a method either template declares is not a 405.
        expect(run('PATCH', '/things/search').passed).toBe(true);
        expect(run('GET', '/things/search')).toMatchObject({
            status: 405,
            allow: 'DELETE, PATCH, POST, PUT'
        });
    });
});
