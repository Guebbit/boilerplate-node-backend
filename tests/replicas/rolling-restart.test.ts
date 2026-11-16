/**
 * @module
 * A rolling restart behind a load balancer: every copy stopped and started in turn while traffic
 * never pauses. The balancer learns a copy is leaving only by polling `/readyz`, so a copy that
 * closes its listener at the signal drops the requests sent to it before the next poll. The
 * lame-duck delay (`NODE_SHUTDOWN_DELAY_MS`) is what the copies are given here; the proxy must
 * count no 502 and no 503, and every request must be answered 200.
 *
 * @see docs/build/cluster-testing.md#the-multi-copy-suite
 * @see docs/operate/health-checks.md#shutting-down-behind-a-load-balancer
 */

import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { retryUntil } from '@tests/eventually';
import { call, jsonHeaders, signUpAndLogIn } from './support/client';
import { BOOT_TIMEOUT_MS, withReplicas, type Copy, type Replicas } from './support/copies';

/** Copies behind the proxy. */
const COPIES = 3;

/**
 * Each copy boots twice and stops once (up to the harness's 20 s kill), one after another, so the
 * window is the boots plus the stops plus margin.
 */
jest.setTimeout(COPIES * BOOT_TIMEOUT_MS * 2 + 180_000);

/**
 * The lame-duck delay every copy runs with. At least four of the proxy's 250 ms readiness polls,
 * or the case races the poll it exists to prove the copy outlives.
 */
const DELAY_MS = 1000;

/** Requests in flight at once, each followed by a short pause: steady load, not a burst. */
const LOADERS = 4;

/** Pause between one loader's requests. */
const LOADER_PAUSE_MS = 20;

/** An address body the contract accepts. */
const ADDRESS = JSON.stringify({
    fullName: 'A B',
    street: 'Via Roma 1',
    city: 'Milano',
    zip: '20100',
    country: 'IT'
});

/** What the steady traffic saw, and the handle to stop it. */
interface Traffic {
    /** The status of every request that was answered. */
    statuses: number[];
    /** Every request that got no answer at all (a reset or refused connection). */
    errors: unknown[];
    /** Stops the loaders and resolves once the last request is done. */
    stop: () => Promise<void>;
}

/**
 * Sends `GET /` through `base` from several loaders until stopped.
 *
 * @param base - the proxy's base URL
 */
const startTraffic = (base: string): Traffic => {
    const statuses: number[] = [];
    const errors: unknown[] = [];
    let running = true;
    const loop = (): Promise<void> =>
        running
            ? call(base, '/')
                  .then(
                      (answer) => {
                          statuses.push(answer.status);
                      },
                      (error: unknown) => {
                          errors.push(error);
                      }
                  )
                  .then(() => sleep(LOADER_PAUSE_MS))
                  .then(loop)
            : Promise.resolve();
    const loaders = Array.from({ length: LOADERS }, loop);
    return {
        statuses,
        errors,
        stop: () => {
            running = false;
            return Promise.all(loaders).then(() => undefined);
        }
    };
};

/**
 * A POST to one copy whose body arrives in two parts, so the request is in flight when the copy is
 * told to stop.
 *
 * @param port - the copy's port
 * @param bearer - the account's access token
 * @returns `finish` sends the second half; `status` resolves with the answer's status
 */
const startSlowPost = (port: number, bearer: string) => {
    const request = http.request({
        host: '127.0.0.1',
        port,
        path: '/account/addresses',
        method: 'POST',
        agent: false,
        headers: { ...jsonHeaders(bearer), 'content-length': Buffer.byteLength(ADDRESS) }
    });
    const status = new Promise<number>((resolve, reject) => {
        request.on('response', (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
        });
        request.on('error', reject);
    });
    const half = Math.floor(ADDRESS.length / 2);
    request.write(ADDRESS.slice(0, half));
    return {
        status,
        finish: () => {
            request.end(ADDRESS.slice(half));
        }
    };
};

/**
 * Stops one copy while a slow request is open on it, starts it again, and waits until the proxy
 * sends it traffic once more, so the next copy is never stopped while this one is still out.
 *
 * @param replicas - the rig
 * @param copy - the copy to restart
 * @param bearer - the account's access token
 */
const restart = (replicas: Replicas, copy: Copy, bearer: string): Promise<number> => {
    const slow = startSlowPost(copy.port, bearer);
    // The headers and half the body are in before the stop signal.
    return sleep(100)
        .then(() => {
            const stopping = copy.stop();
            // Past the delay, so the request ends while the listener is closed and the copy drains.
            return sleep(DELAY_MS + 500).then(() => {
                slow.finish();
                return Promise.all([slow.status, stopping]);
            });
        })
        .then(([status]) => {
            const servedBefore = replicas.proxy.servedBy().get(copy.name) ?? 0;
            return copy
                .start()
                .then(() =>
                    retryUntil(
                        () =>
                            (replicas.proxy.servedBy().get(copy.name) ?? 0) > servedBefore
                                ? Promise.resolve()
                                : Promise.reject(new Error(`${copy.name} gets no traffic yet`)),
                        BOOT_TIMEOUT_MS,
                        100
                    )
                )
                .then(() => status);
        });
};

describe('a rolling restart', () => {
    it('drops no request: the proxy counts no 502 or 503 and every request is answered 200', () =>
        withReplicas(
            {
                count: COPIES,
                env: {
                    NODE_SHUTDOWN_DELAY_MS: String(DELAY_MS),
                    // The steady load would otherwise spend the default per-address budget and read 429.
                    NODE_RATE_LIMIT_MAX: '1000000'
                }
            },
            (replicas) => {
                const base = `http://127.0.0.1:${String(replicas.proxy.port)}`;
                return signUpAndLogIn(base, 'rolling-user').then(async ({ bearer }) => {
                    const traffic = startTraffic(base);
                    const slowStatuses: number[] = [];
                    // One copy after another: never two out at once.
                    const restartAll = async () => {
                        for (const copy of replicas.copies) {
                            slowStatuses.push(await restart(replicas, copy, bearer));
                        }
                    };
                    // Stopped however the restarts end: loaders left running against a dead proxy
                    // would hold the jest process open and turn a failure into a hung job.
                    await restartAll().finally(() => traffic.stop());

                    expect(replicas.proxy.failures()).toEqual({ badGateway: 0, unavailable: 0 });
                    expect(traffic.errors).toEqual([]);
                    expect(traffic.statuses.filter((status) => status !== 200)).toEqual([]);
                    // The slow request on each stopping copy ended with its 2xx, not a cut socket.
                    expect(slowStatuses).toEqual(replicas.copies.map(() => 201));
                    // The controls: the load really ran, and every copy, restarted ones included, served it.
                    expect(traffic.statuses.length).toBeGreaterThan(100);
                    expect(replicas.proxy.servedBy().size).toBe(COPIES);
                });
            }
        ));
});
