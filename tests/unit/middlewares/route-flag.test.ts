/**
 * `routeFlag` is what lets `DELETE /products/:id/hard` and
 * `DELETE /products/:id?hardDelete=true` reach the same controller with one input declaration
 * instead of two entry points.
 *
 * The mechanism it relies on — express keeping a mutated `request.params` for the rest of the
 * route's handler chain — is verified end-to-end by the products/users integration suites; these
 * cases pin the middleware's own behaviour.
 */
import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { routeFlag } from '@middlewares/route-flag';

const makeRequest = (params: Record<string, string> = {}) =>
    ({ params }) as unknown as Request<ParamsDictionary>;

const response = {} as Response;

describe('routeFlag', () => {
    it('writes the flag onto request.params so readInput can find it', () => {
        const request = makeRequest({ id: 'abc' });
        const next = jest.fn();

        routeFlag('hardDelete')(request, response, next);

        expect(request.params).toEqual({ id: 'abc', hardDelete: 'true' });
        expect(next).toHaveBeenCalledTimes(1);
    });

    // A string, because that is what a route param always is — `readInput` decodes the declared
    // booleans out of the string transports, so the controller still sees a real `true`.
    it('writes a string, not a boolean', () => {
        const request = makeRequest();

        routeFlag('hardDelete')(request, response, jest.fn());

        expect(request.params.hardDelete).toBe('true');
    });

    it('accepts an explicit value', () => {
        const request = makeRequest();

        routeFlag('hardDelete', 'false')(request, response, jest.fn());

        expect(request.params.hardDelete).toBe('false');
    });

    it('does not disturb the params the route already matched', () => {
        const request = makeRequest({ id: 'abc', productId: 'def' });

        routeFlag('hardDelete')(request, response, jest.fn());

        expect(request.params.id).toBe('abc');
        expect(request.params.productId).toBe('def');
    });
});
