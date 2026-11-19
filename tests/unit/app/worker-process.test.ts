/**
 * `createWorker`: what the worker process boots, how it answers on its own port, and how it stops.
 *
 * The order is the behaviour: consumers bind LAST, after the shared boot (stores, translations,
 * mail templates), or a job taken in the first second would send a key instead of a sentence.
 */
import { createServer, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { setEnvironment } from '@tests/environment';

/** The steps the worker ran, in order. */
const calls: string[] = [];

/** The shared teardown, recorded rather than run. */
const stopProcess = jest.fn(() => Promise.resolve());

/** The module registry's registration, recorded rather than run. */
const registerModules = jest.fn();

jest.mock('../../../src/app/process-boot', () => ({
    bootProcess: () => {
        calls.push('boot-process');
        return Promise.resolve();
    },
    createStop: () => stopProcess
}));
jest.mock('../../../src/app/workers', () => ({
    registerWorkers: () => {
        calls.push('consumers');
        return Promise.resolve();
    }
}));
jest.mock('@kernel/registry', () => ({ registerModules }));
jest.mock('../../../src/app/config', () => ({ APP_CONFIG_SLICES: ['stub-slice'] }));
// The one real thing a worker mounts: observability's scrape, behind its own credential guard.
jest.mock('../../../src/modules', () => ({
    enabledModules: [
        {
            name: 'observability',
            workerMounts: [
                {
                    basePath: '/observability',
                    routes: jest.requireActual('@modules/observability/worker-routes').workerRouter
                }
            ]
        },
        { name: 'no-worker-routes' }
    ]
}));

import { createWorker } from '@app/worker-process';

/** Where the listener a started worker opened can be reached. */
const urlOf = (server: Server, path: string) =>
    `http://127.0.0.1:${String((server.address() as AddressInfo).port)}${path}`; // listening on a TCP port: address() is an AddressInfo, not a pipe name

/** A port nothing listens on right now: the operating system picks one (0), and it is released. */
const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, () => {
            const { port } = probe.address() as AddressInfo; // listening on a TCP port: address() is an AddressInfo
            probe.close(() => resolve(port));
        });
    });

/**
 * Starts a worker on a free port and runs `body` against it.
 *
 * @param body - the check; the listener is closed when it settles
 */
const withStartedWorker = (body: (server: Server) => Promise<void>) =>
    freePort().then((port) => {
        setEnvironment({ NODE_WORKER_PORT: String(port) });
        return createWorker()
            .start()
            .then((server) =>
                body(server).finally(() => new Promise((resolve) => server.close(resolve)))
            );
    });

beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
});

describe('createWorker', () => {
    it('registers the modules once, at creation, with the app config slices', () => {
        createWorker();

        expect(registerModules).toHaveBeenCalledTimes(1);
        expect(registerModules.mock.calls[0]?.[1]).toEqual(['stub-slice']);
    });

    it('binds the consumers only after the shared boot', async () => {
        await createWorker().boot();

        expect(calls).toEqual(['boot-process', 'consumers']);
    });

    describe('its listener', () => {
        it('opens only after the consumers are bound', () =>
            withStartedWorker((server) => {
                expect(calls.at(-1)).toBe('consumers');
                expect(server.listening).toBe(true);
                return Promise.resolve();
            }));

        it('answers GET /livez, and nothing the API serves', () =>
            withStartedWorker(async (server) => {
                const livez = await fetch(urlOf(server, '/livez'));
                const products = await fetch(urlOf(server, '/products'));

                expect([livez.status, products.status]).toEqual([200, 404]);
            }));

        it('sends the API secure headers and answers an unknown path with its problem-details 404', () =>
            withStartedWorker(async (server) => {
                const response = await fetch(urlOf(server, '/nothing-here'));

                expect(response.headers.get('x-powered-by')).toBeNull();
                expect(response.headers.get('x-content-type-options')).toBe('nosniff');
                expect(response.status).toBe(404);
                expect(response.headers.get('content-type')).toContain('application/problem+json');
            }));

        it('serves the scrape behind the scraper credential, like the API', () => {
            setEnvironment({ NODE_METRICS_TOKEN: 'scrape-me' });
            return withStartedWorker(async (server) => {
                const url = urlOf(server, '/observability/metrics');
                const anonymous = await fetch(url);
                const wrong = await fetch(url, { headers: { Authorization: 'Bearer nope' } });
                const scraper = await fetch(url, {
                    headers: { Authorization: 'Bearer scrape-me' }
                });

                expect([anonymous.status, wrong.status, scraper.status]).toEqual([401, 401, 200]);
                expect(await scraper.text()).toContain('# HELP');
            });
        });

        it('refuses the scrape when no token is configured', () => {
            setEnvironment({ NODE_METRICS_TOKEN: undefined });
            return withStartedWorker(async (server) => {
                const response = await fetch(urlOf(server, '/observability/metrics'), {
                    headers: { Authorization: 'Bearer anything' }
                });

                expect(response.status).toBe(503);
            });
        });
    });
});
