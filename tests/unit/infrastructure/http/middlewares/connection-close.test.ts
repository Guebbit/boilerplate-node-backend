/**
 * `closeWhileDraining` over real sockets: whether the connection stays reusable is Node's own
 * decision, made from the header this middleware sets. The process phase is module state with no
 * reset, so the cases run in order: serving first, draining after.
 */
import http, { type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { closeWhileDraining } from '@infrastructure/http/middlewares/connection-close';
import { markServerDraining } from '@infrastructure/runtime/readiness';
import { listenOn } from '@infrastructure/runtime/server-lifecycle';

/** The app under test, listening on an ephemeral port. */
let server: Server;

/** The keep-alive agent every request goes through, so a closed socket would show. */
let agent: http.Agent;

/** Answers the `/slow` request, once it has arrived and the test says so. */
let answerSlow: () => void;

/** Resolves when `/slow` has reached its handler, i.e. the request began. */
let slowArrived: Promise<void>;

beforeAll(async () => {
    const app = express();
    app.use(closeWhileDraining);
    app.get('/', (_request, response) => {
        response.status(200).end();
    });
    // Holds its answer, so a request can begin before the shutdown signal and end after it.
    app.get('/slow', (_request, response) => {
        answerSlow = () => {
            response.status(200).end();
        };
        arrive();
    });
    server = await listenOn(app, 0, '127.0.0.1');
    agent = new http.Agent({ keepAlive: true });
});

/** Called by the `/slow` handler; replaced per case by {@link expectSlow}. */
let arrive: () => void = () => undefined;

/** Arms `slowArrived` for the next `/slow` request. */
const expectSlow = () => {
    slowArrived = new Promise<void>((resolve) => {
        arrive = resolve;
    });
};

afterAll(() => {
    agent.destroy();
    server.close();
});

/** One request through the keep-alive agent. */
const get = (path = '/') =>
    new Promise<IncomingMessage>((resolve) => {
        http.get(
            { port: (server.address() as AddressInfo).port, host: '127.0.0.1', path, agent },
            (response) => {
                response.resume();
                response.on('end', () => {
                    resolve(response);
                });
            }
        );
    });

describe('closeWhileDraining', () => {
    it('leaves the connection reusable while the process is serving', async () => {
        const response = await get();

        expect(response.headers.connection).toBe('keep-alive');
    });

    it('answers Connection: close to a request that began before the signal', async () => {
        expectSlow();
        const pending = get('/slow');
        await slowArrived;

        markServerDraining();
        answerSlow();
        const response = await pending;

        expect(response.headers.connection).toBe('close');
    });

    it('answers Connection: close to a request that begins after the signal', async () => {
        const response = await get();

        expect(response.headers.connection).toBe('close');
    });
});
