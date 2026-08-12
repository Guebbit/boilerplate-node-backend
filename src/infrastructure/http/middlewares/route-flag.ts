import type { RequestHandler } from 'express';

/**
 * Let a route say what it means, as a route param the controller reads like any other.
 *
 * `DELETE /products/:id/hard` and `DELETE /products/:id?hardDelete=true` are the same operation
 * spelled two ways — the point of accepting a value from several sources at all. The query form
 * carries the flag as a value; the path form carries it in the URL itself, and this is what turns
 * that into something `readInput` can read, so the controller keeps one declaration instead of
 * growing a second entry point.
 *
 * It writes to `request.params` rather than `request.query` for two reasons: express 5 exposes
 * `query` through a getter that is not writable, and the path segment genuinely *is* a route
 * param — it just happens to be spelled as a literal so that `/products/{id}/false` cannot exist.
 *
 * The value is a string because that is what a route param always is; `readInput` decodes the
 * declared booleans out of the string transports, so the controller sees a real `true`.
 */
export const routeFlag =
    (field: string, value = 'true'): RequestHandler =>
    (request, _response, next) => {
        request.params[field] = value;
        next();
    };
