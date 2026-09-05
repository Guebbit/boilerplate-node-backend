/**
 * @module
 * Turns a route-level detail spelled in the URL (e.g. a `/hard` suffix) into a value `readInput`
 * can read like any other param, so a second spelling of an operation does not need a second
 * controller entry point.
 */

import type { RequestHandler } from 'express';

/**
 * Let a route say what it means, as a route param the controller reads like any other.
 *
 * `DELETE /products/:id/hard` and `DELETE /products/:id?hardDelete=true` are the same operation
 * spelled two ways, and this is what lets `readInput` read either without a second controller.
 * Writes to `request.params`, not `request.query`, because express 5 exposes `query` through a
 * getter that isn't writable — and the path segment genuinely *is* a route param.
 */
export const routeFlag =
    (field: string, value = 'true'): RequestHandler =>
    (request, _response, next) => {
        request.params[field] = value;
        next();
    };
