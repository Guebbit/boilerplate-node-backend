/**
 * `src/infrastructure/runtime/database.ts` — which connect failures are worth retrying.
 */
import mongoose from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { isPermanentConnectError, start, stopDatabase } from '@infrastructure/runtime/database';
import { setEnvironment } from '@tests/environment';

describe('isPermanentConnectError', () => {
    it.each([
        ['a URI that does not parse', { name: 'MongoParseError' }],
        ['an invalid connection option', { name: 'MongoInvalidArgumentError' }],
        ['credentials the server refuses', { name: 'MongoServerError', code: 18 }]
    ])('gives up at once on %s', (_label, error) => {
        expect(isPermanentConnectError(error)).toBe(true);
    });

    it('keeps retrying a server that is simply not up yet', () => {
        expect(isPermanentConnectError({ name: 'MongoServerSelectionError' })).toBe(false);
    });
});

describe('start', () => {
    it('fails the boot on the first attempt when the configuration is wrong', async () => {
        const connect = jest
            .spyOn(mongoose, 'connect')
            .mockRejectedValue(Object.assign(new Error('bad uri'), { name: 'MongoParseError' }));

        await expect(start()).rejects.toThrow(/not retrying/);
        expect(connect).toHaveBeenCalledTimes(1);
        connect.mockRestore();
    });

    describe('autoIndex (B22)', () => {
        it('turns autoIndex off before connecting, in production', async () => {
            setEnvironment({ NODE_ENV: 'production' });
            const setSpy = jest.spyOn(mongoose, 'set');
            const connect = jest.spyOn(mongoose, 'connect').mockImplementation(() => {
                // Every cron process (a reaper, a sweep) shares this same guard, not only the
                // ones that boot through `createApp()`'s `boot` — asserted at connect time, since
                // that's the moment an index would otherwise build.
                expect(setSpy).toHaveBeenCalledWith('autoIndex', false);
                return Promise.resolve(mongoose);
            });

            await start();

            connect.mockRestore();
            setSpy.mockRestore();
        });

        it('turns autoIndex off when NODE_ENV is unset, like any server', async () => {
            setEnvironment({ NODE_ENV: undefined });
            const setSpy = jest.spyOn(mongoose, 'set');
            const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

            await start();

            expect(setSpy).toHaveBeenCalledWith('autoIndex', false);
            connect.mockRestore();
            setSpy.mockRestore();
        });

        it('leaves the development default untouched', async () => {
            setEnvironment({ NODE_ENV: 'development' });
            const setSpy = jest.spyOn(mongoose, 'set');
            const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

            await start();

            expect(setSpy).not.toHaveBeenCalledWith('autoIndex', expect.anything());
            connect.mockRestore();
            setSpy.mockRestore();
        });
    });
});

describe('connection loss logging', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('reports a drop nobody asked for, but not the one stopDatabase causes', async () => {
        jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        await start();

        mongoose.connection.emit('disconnected');
        expect(warn).toHaveBeenCalledWith('MongoDB connection lost.');

        warn.mockClear();
        jest.spyOn(mongoose, 'disconnect').mockImplementation(() => {
            mongoose.connection.emit('disconnected');
            return Promise.resolve();
        });
        await stopDatabase();

        expect(warn).not.toHaveBeenCalled();
    });
});
