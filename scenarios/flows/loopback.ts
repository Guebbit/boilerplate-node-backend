/**
 * @module
 * A throwaway listener for driving the app over real HTTP without publishing a port.
 *
 * Both callers reach for it at a moment when the app is NOT otherwise listening: the demo
 * profile drives its flows before `src/app.ts` binds `NODE_PORT` (so the paired frontend's
 * readiness probe never sees a half-built shop), and `scenarios/apply.ts` has no server at all.
 * `app.listen()` builds a fresh `http.Server` each call, so this never collides with the real one.
 */

import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

/**
 * Listen on an ephemeral loopback port, run `drive` against it, and close — whatever `drive` did.
 *
 * Port `0` asks the OS for a free one and `127.0.0.1` keeps it off every other interface: this
 * server answers unauthenticated `/__test/*` routes in the demo profile, and it exists for the
 * length of one seed.
 *
 * @param app - the Express application to serve
 * @param drive - what to do with the base URL, e.g. `http://127.0.0.1:54123`
 * @returns whatever `drive` resolved to
 */
export const withLoopbackServer = <T>(
    app: Express,
    drive: (baseUrl: string) => Promise<T>
): Promise<T> =>
    new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => {
            // `address()` is a string only for a UNIX socket, which `listen(0, host)` never is.
            const { port } = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${String(port)}`,
                close: () => new Promise<void>((done) => server.close(() => done()))
            });
        });
        server.on('error', reject);
    }).then(({ baseUrl, close }) =>
        drive(baseUrl).then(
            (outcome) => close().then(() => outcome),
            (error: unknown) =>
                close().then(() => {
                    throw error;
                })
        )
    );
