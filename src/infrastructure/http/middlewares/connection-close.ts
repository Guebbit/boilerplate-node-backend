/**
 * @module
 * While the process drains for shutdown, every response tells its client to close the connection,
 * whenever the request began.
 *
 * Node keeps a connection alive on a response already in flight when `server.close()` runs, so a
 * pooled client (a load balancer's upstream pool) would send its next request down a socket that
 * is about to be cut. `Connection: close` makes the client open a fresh one, which a load
 * balancer sends to another copy.
 *
 * @see docs/operate/health-checks.md#shutting-down-behind-a-load-balancer
 */

import type { NextFunction, Request, Response } from 'express';
import { isServerDraining } from '@infrastructure/runtime/readiness';

/**
 * Sets `Connection: close` on the response once a shutdown signal has arrived, decided when the
 * head is written rather than when the request came in: a slow request that began before the
 * signal still tells its client not to reuse the socket. First in the stack, so a refusal from
 * any later middleware carries it too.
 *
 * Wraps `writeHead`, like `dropUnownedValidators` (`on-headers` is not a dependency): `res.send`
 * and `res.end` reach the head through it, and a header set earlier (the SSE open sets
 * `keep-alive`) is overwritten here.
 *
 * @param _request - unused
 * @param response - the response to mark
 * @param next - continues the stack
 */
export const closeWhileDraining = (_request: Request, response: Response, next: NextFunction) => {
    const writeHead = response.writeHead.bind(response);
    /**
     * Node's `ServerResponse#writeHead` has several overloads; the wrapper forwards whichever one
     * was called. https://nodejs.org/api/http.html#responsewriteheadstatuscode-statusmessage-headers
     */
    response.writeHead = ((...arguments_: Parameters<Response['writeHead']>) => {
        if (isServerDraining()) response.setHeader('Connection', 'close');
        return writeHead(...arguments_);
        /**
         * `writeHead` is overloaded, so the wrapper's rest-args signature cannot be matched to any
         * one overload; it forwards its arguments untouched.
         */
    }) as Response['writeHead'];
    next();
};
