/**
 * @module
 * The 405 guard: a path the contract knows, asked with a method it does not give it, answers
 * 405 + `Allow` (RFC 9110 §15.5.6) instead of the catch-all's 404.
 *
 * Mounted right before the 404 catch-all, so it only ever sees a request no route answered.
 * A path of a module this build does not serve stays a 404: the module is not there to be asked.
 *
 * See: docs/api/write-methods.md#a-known-path-with-the-wrong-method
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import type { OperationRoute } from '@api/operation-routes';

/**
 * The methods a request path can be asked with: every method of every live path template that
 * matches it, plus HEAD wherever GET is (Express answers a HEAD through the GET route).
 *
 * @param routes - the generated path table
 * @param served - the modules this build mounts
 * @param path - the request path, without a trailing slash
 * @returns the allowed methods, sorted; empty when no served path matches
 */
const allowedMethods = (
    routes: readonly OperationRoute[],
    served: ReadonlySet<string>,
    path: string
): string[] => {
    const methods = new Set(
        routes
            .filter(
                (route) =>
                    (route.module === null || served.has(route.module)) && route.pattern.test(path)
            )
            .flatMap((route) => route.methods)
    );
    if (methods.has('GET')) methods.add('HEAD');
    return [...methods].toSorted();
};

/**
 * Builds the guard from the generated path table.
 *
 * `OPTIONS` is never judged: the CORS layer answers a preflight before any route runs, and a bare
 * `OPTIONS` is not a method the contract could have left out.
 *
 * @param routes - every contract path with its methods and owning module
 * @param served - the names of the modules this build mounts
 * @returns express middleware answering 405 + `Allow`, or passing on to the 404
 */
export const methodNotAllowed = (
    routes: readonly OperationRoute[],
    served: ReadonlySet<string>
): RequestHandler => {
    return (request: Request, response: Response, next: NextFunction) => {
        const path = request.path.length > 1 ? request.path.replace(/\/$/, '') : request.path;
        const allowed = allowedMethods(routes, served, path);

        if (
            allowed.length === 0 ||
            request.method === 'OPTIONS' ||
            allowed.includes(request.method)
        ) {
            next();
            return;
        }

        response.setHeader('Allow', allowed.join(', '));
        rejectResponse(response, 405);
    };
};
