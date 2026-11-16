/**
 * `src/infrastructure/runtime/server-lifecycle.ts` — binding, a failed boot, and closing a server
 * that still has connections open. Real sockets on an ephemeral loopback port: the behaviour under
 * test is Node's and Express's own, which a stub would only restate.
 */
import http, { type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { openSseStream } from '@infrastructure/http/sse';
import { setEnvironment } from '@tests/environment';
import { closeServer, failBoot, listenOn } from '@infrastructure/runtime/server-lifecycle';

/** Bind a throwaway app on an ephemeral loopback port. */
const listenEphemeral = (): Promise<Server> => listenOn(express(), 0, '127.0.0.1');

/** The port a listening server was given. */
const portOf = (server: Server): number => (server.address() as AddressInfo).port;

describe('listenOn', () => {
    it('resolves with a server that is actually listening', async () => {
        const server = await listenEphemeral();

        expect(server.listening).toBe(true);
        await closeServer(server);
    });

    it('rejects when the port is already taken, instead of reporting success', async () => {
        const holder = await listenEphemeral();

        await expect(listenOn(express(), portOf(holder), '127.0.0.1')).rejects.toMatchObject({
            code: 'EADDRINUSE'
        });
        await closeServer(holder);
    });
});

describe('closeServer', () => {
    it('does not wait on an idle keep-alive connection', async () => {
        const server = await listenEphemeral();
        const agent = new http.Agent({ keepAlive: true });
        await new Promise<void>((resolve) => {
            http.get({ port: portOf(server), host: '127.0.0.1', agent }, (response) => {
                response.resume();
                response.on('end', resolve);
            });
        });

        // Would hang until the keep-alive timeout if the idle socket were left open.
        await expect(closeServer(server)).resolves.toBeUndefined();
        agent.destroy();
    });
});

describe('closeServer with a stream open', () => {
    it('ends the stream with a reconnect delay instead of waiting for the cut', async () => {
        // A budget far past the test's own timeout: only ending the stream lets close() finish.
        setEnvironment({ NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: '600000' });
        const app = express();
        app.get('/stream', (_request, response) => {
            openSseStream(response, 'user-1', () => Promise.resolve(true));
        });
        const server = await listenOn(app, 0, '127.0.0.1');
        // The headers have arrived: the stream is open before the close begins.
        const response = await new Promise<IncomingMessage>((resolve) => {
            http.get({ port: portOf(server), host: '127.0.0.1', path: '/stream' }, resolve);
        });
        // Resolves with the whole body once the server has ended the stream.
        const received = new Promise<string>((resolve) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
                body += chunk;
            });
            response.on('end', () => {
                resolve(body);
            });
        });

        await closeServer(server);

        await expect(received).resolves.toMatch(/^retry: \d+\n\n$/);
    });
});

describe('failBoot', () => {
    it('runs the teardown, then exits non-zero', async () => {
        const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stop = jest.fn(() => Promise.resolve());

        await failBoot(new Error('database unreachable'), stop);

        expect(stop).toHaveBeenCalled();
        expect(exit).toHaveBeenCalledWith(1);
        exit.mockRestore();
    });

    it('still exits when the teardown itself fails', async () => {
        const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await failBoot(new Error('boot'), () => Promise.reject(new Error('teardown')));

        expect(exit).toHaveBeenCalledWith(1);
        exit.mockRestore();
    });
});
