/**
 * `src/infrastructure/runtime/database.ts` — which connect failures are worth retrying.
 */
import mongoose from 'mongoose';
import { isPermanentConnectError, start } from '@infrastructure/runtime/database';

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
        const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

        afterEach(() => {
            process.env.NODE_ENV = ORIGINAL_NODE_ENV;
        });

        it('turns autoIndex off before connecting, in production', async () => {
            process.env.NODE_ENV = 'production';
            const setSpy = jest.spyOn(mongoose, 'set');
            const connect = jest.spyOn(mongoose, 'connect').mockImplementation(() => {
                // Every cron process (a reaper, a sweep) shares this same guard, not only the
                // ones that boot through `bootInfrastructure` — asserted at connect time, since
                // that's the moment an index would otherwise build.
                expect(setSpy).toHaveBeenCalledWith('autoIndex', false);
                return Promise.resolve(mongoose);
            });

            await start();

            connect.mockRestore();
            setSpy.mockRestore();
        });

        it('leaves the development default untouched', async () => {
            process.env.NODE_ENV = 'development';
            const setSpy = jest.spyOn(mongoose, 'set');
            const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

            await start();

            expect(setSpy).not.toHaveBeenCalledWith('autoIndex', expect.anything());
            connect.mockRestore();
            setSpy.mockRestore();
        });
    });
});
