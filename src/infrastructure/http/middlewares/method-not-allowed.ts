/**
 * @module
 * The 405 guard: a path the contract knows, asked with a method it does not give it, answers
 * 405 + `Allow` (RFC 9110 §15.5.6) instead of the catch-all's 404.
 *
 * Two mounts: before the routers for a path a more specific template shadows (OAS matches a literal
 * path before a templated one, so `DELETE /products/facets` must not reach `/products/{id}`, nor
 * `GET /payments/1/refunds/sync` reach `/payments/{id}/refunds/{refundId}`), and right
 * before the 404 catch-all for everything else, where it only sees a request no route answered.
 * A path of a module this build does not serve stays a 404: the module is not there to be asked.
 *
 * @see docs/understand/write-methods.md#a-known-path-with-the-wrong-method
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import type { OperationRoute } from '@api/operation-routes';
import { declaredOperation } from '@infrastructure/http/middlewares/content-type';
import type { RequestContentType } from '@api/request-content-types';

/**
 * The methods a request path can be asked with: every method of every live path template that
 * matches it, plus HEAD wherever GET is (Express answers a HEAD through the GET route) and
 * `OPTIONS` on any path that has a method at all (every served path answers it). The one place
 * `Allow` is computed, for the 405 and for the `OPTIONS` answer alike.
 *
 * @param routes - the generated path table
 * @param served - the modules this build mounts
 * @param path - the request path, without a trailing slash
 * @param shadowedOnly - count only the most specific templates (fewest `{param}`), and only when one shadows another
 * @returns the allowed methods, sorted; empty when no served path matches
 */
const allowedMethods = (
    routes: readonly OperationRoute[],
    served: ReadonlySet<string>,
    path: string,
    shadowedOnly: boolean
): string[] => {
    const matching = routes.filter(
        (route) => (route.module === null || served.has(route.module)) && route.pattern.test(path)
    );
    /**
     * Our rule, borrowed from OAS's "a concrete path beats a templated one": the template with
     * fewer `{param}` wins, so `/a/{id}/sync` shadows `/a/{id}/{other}`.
     * A match with no `{param}` at all always counts; otherwise only a strictly more specific one narrows.
     */
    const fewest = Math.min(...matching.map((route) => route.parameterCount));
    const mostParameters = Math.max(...matching.map((route) => route.parameterCount));
    const shadowed = fewest === 0 || fewest < mostParameters;
    const counted = shadowedOnly
        ? matching.filter((route) => shadowed && route.parameterCount === fewest)
        : matching;
    const methods = new Set(counted.flatMap((route) => route.methods));
    if (methods.has('GET')) methods.add('HEAD');
    if (methods.size > 0) methods.add('OPTIONS');
    return [...methods].toSorted();
};

/**
 * Builds the guard from the generated path table.
 *
 * `OPTIONS` is never judged here: `answerOptions` answers every `OPTIONS` before any router runs,
 * and a bare `OPTIONS` is not a method the contract could have left out.
 *
 * @param routes - every contract path with its methods and owning module
 * @param served - the names of the modules this build mounts
 * @param shadowedOnly - judge only a path a more specific template shadows: the mount that runs before the routers
 * @returns express middleware answering 405 + `Allow`, or passing on to the 404
 */
export const methodNotAllowed = (
    routes: readonly OperationRoute[],
    served: ReadonlySet<string>,
    shadowedOnly = false
): RequestHandler => {
    return (request: Request, response: Response, next: NextFunction) => {
        const path = request.path.length > 1 ? request.path.replace(/\/$/, '') : request.path;
        const allowed = allowedMethods(routes, served, path, shadowedOnly);

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

/**
 * Strips one trailing slash, so `/things/` reads as `/things`.
 *
 * @param path - the request path
 * @returns the path without a trailing slash (the root stays `/`)
 */
const withoutTrailingSlash = (path: string): string =>
    path.length > 1 ? path.replace(/\/$/, '') : path;

/**
 * The PATCH formats a path accepts: its PATCH row of the generated table, the same one the 415
 * guard reads (`declaredOperation`).
 *
 * @param contentTypes - the generated request-body table
 * @param path - the request path, without a trailing slash
 * @returns the declared media types, empty when no PATCH row matches
 */
const patchTypes = (contentTypes: readonly RequestContentType[], path: string): readonly string[] =>
    declaredOperation(contentTypes, 'PATCH', path)?.types ?? [];

/**
 * Builds the one `OPTIONS` answer, mounted right after `cors` (which runs with
 * `preflightContinue: true`, so every `OPTIONS` reaches it whatever the Origin).
 *
 * Answers:
 *  - the path of a served module: 204 + `Allow` (+ `Accept-Patch` when `Allow` has PATCH);
 *  - `OPTIONS *`, or a preflight (`Access-Control-Request-Method`) on any path: 204;
 *  - a plain `OPTIONS` on a path no served module owns: the 404 problem.
 *
 * The 204 carries no `Content-Length` (RFC 9110 §8.6). `Allow` lists `OPTIONS` itself, like
 * the 405. A path with literal templates answers from those alone, as the router would.
 *
 * @see docs/understand/write-methods.md#options-says-what-a-path-accepts
 * @param routes - every contract path with its methods and owning module
 * @param served - the names of the modules this build mounts
 * @param contentTypes - the generated request-body table, for `Accept-Patch`
 * @returns express middleware that answers `OPTIONS` and passes every other method on
 */
export const answerOptions = (
    routes: readonly OperationRoute[],
    served: ReadonlySet<string>,
    contentTypes: readonly RequestContentType[]
): RequestHandler => {
    return (request: Request, response: Response, next: NextFunction) => {
        if (request.method !== 'OPTIONS') {
            next();
            return;
        }

        const path = withoutTrailingSlash(request.path);
        const literal = allowedMethods(routes, served, path, true);
        const allowed = literal.length > 0 ? literal : allowedMethods(routes, served, path, false);

        if (allowed.length > 0) {
            response.setHeader('Allow', allowed.join(', '));
            const types = allowed.includes('PATCH') ? patchTypes(contentTypes, path) : [];
            if (types.length > 0) response.setHeader('Accept-Patch', types.join(', '));
        } else if (
            request.url !== '*' &&
            request.get('Access-Control-Request-Method') === undefined
        ) {
            rejectResponse(response, 404);
            return;
        }

        // `end()` on a 204 sends no body and no Content-Length.
        response.status(204).end();
    };
};
