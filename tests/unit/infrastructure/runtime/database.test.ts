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
});
