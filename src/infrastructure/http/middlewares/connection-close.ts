/**
 * @module
 * While the process drains for shutdown, every response tells its client to close the connection.
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
 * Sets `Connection: close` on the response once a shutdown signal has arrived. First in the
 * stack, so a refusal from any later middleware carries it too.
 *
 * @param _request - unused
 * @param response - the response to mark
 * @param next - continues the stack
 */
export const closeWhileDraining = (_request: Request, response: Response, next: NextFunction) => {
    if (isServerDraining()) response.setHeader('Connection', 'close');
    next();
};
