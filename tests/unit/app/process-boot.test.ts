/**
 * `bootProcess` and `createStop`: what the web process and the worker process share.
 *
 * The order is the behaviour: translations load before the validation messages that resolve
 * through them, and the stores connect before anything reads them.
 */
import type { Server } from 'node:http';
import { asStub } from '@tests/stub';

/** The steps that ran, in order. */
const calls: string[] = [];

/** Records `name` and resolves, for a step that returns a promise. */
const step = (name: string) => () => {
    calls.push(name);
    return Promise.resolve();
};

/** The lifecycle's teardown, recorded rather than run. */
const shutdownInfra = jest.fn((_server?: Server) => Promise.resolve());

jest.mock('@infrastructure/runtime/database', () => ({ start: step('database') }));
jest.mock('@infrastructure/adapters/cache', () => ({ startCache: step('cache') }));
jest.mock('@infrastructure/adapters/queue', () => ({ startQueue: step('queue') }));
jest.mock('@infrastructure/http/validation-messages', () => ({
    registerValidationMessages: () => calls.push('validation-messages')
}));
jest.mock('../../../src/app/boot-rendering', () => ({ bootRendering: step('rendering') }));
jest.mock('../../../src/app/workers', () => ({
    registerImageWriteback: () => calls.push('writeback')
}));
jest.mock('@infrastructure/i18n', () => ({
    isLocaleOverrideAvailable: () => true,
    startLocaleOverrideRefresh: () => calls.push('locale-refresh')
}));
jest.mock('@infrastructure/runtime/server-lifecycle', () => ({ shutdownInfra }));
jest.mock('@infrastructure/runtime/settle', () => ({ settleWithin: () => Promise.resolve() }));
jest.mock('@kernel/outbox', () => ({ settleOutboxNudges: () => Promise.resolve() }));

import { bootProcess, createStop } from '@app/process-boot';

beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
});

describe('bootProcess', () => {
    it('connects the stores, then renders, then registers the messages that read the copy', async () => {
        await bootProcess();

        expect(calls).toEqual([
            'database',
            'cache',
            'queue',
            'writeback',
            'rendering',
            'locale-refresh',
            'validation-messages'
        ]);
    });
});

describe('createStop', () => {
    it('shuts down with the listener it is given', async () => {
        const server = asStub<Server>({});
        const stop = createStop(
            () => server,
            () => undefined
        );

        await stop();

        expect(shutdownInfra.mock.calls[0]?.[0]).toBe(server);
    });

    it('forgets the listener once the teardown settles', async () => {
        const forget = jest.fn();

        await createStop(() => undefined, forget)();

        expect(forget).toHaveBeenCalledTimes(1);
    });

    it('joins a shutdown already running instead of starting a second', async () => {
        const stop = createStop(
            () => undefined,
            () => undefined
        );

        await Promise.all([stop(), stop()]);

        expect(shutdownInfra).toHaveBeenCalledTimes(1);
    });

    it('can stop again after a teardown has settled', async () => {
        const stop = createStop(
            () => undefined,
            () => undefined
        );

        await stop();
        await stop();

        expect(shutdownInfra).toHaveBeenCalledTimes(2);
    });
});
