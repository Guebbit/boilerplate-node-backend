/**
 * `closeWhileDraining` over real sockets: whether the connection stays reusable is Node's own
 * decision, made from the header this middleware sets. The process phase is module state with no
 * reset, so the two cases run in order: serving first, draining after.
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

beforeAll(async () => {
    const app = express();
    app.use(closeWhileDraining);
    app.get('/', (_request, response) => {
        response.status(200).end();
    });
    server = await listenOn(app, 0, '127.0.0.1');
    agent = new http.Agent({ keepAlive: true });
});

afterAll(() => {
    agent.destroy();
    server.close();
});

/** One request through the keep-alive agent. */
const get = () =>
    new Promise<IncomingMessage>((resolve) => {
        http.get(
            { port: (server.address() as AddressInfo).port, host: '127.0.0.1', agent },
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

    it('answers Connection: close once the process is draining', async () => {
        markServerDraining();

        const response = await get();

        expect(response.headers.connection).toBe('close');
    });
});
