/**
 * Driver-level Mongo error facts — `src/infrastructure/persistence/mongo-errors.ts`.
 */

import mongoose from 'mongoose';
import { isDuplicateKey, isConnectionError } from '@infrastructure/persistence/mongo-errors';

/** A driver duplicate-key error: the numeric `code` is the discriminator, never the message. */
const makeDuplicateKeyError = () =>
    Object.assign(
        new Error('E11000 duplicate key error collection: app.users index: users_email'),
        {
            code: 11_000
        }
    );

describe('isDuplicateKey', () => {
    it('recognises the driver code', () => {
        expect(isDuplicateKey(makeDuplicateKeyError())).toBe(true);
    });

    it('reads the code, not the message', () => {
        // E11000's text names the index and the duplicated value, so matching on it would break
        // the first time an index is renamed — and would match a message that merely quotes it.
        expect(isDuplicateKey(new Error('E11000 duplicate key error'))).toBe(false);
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isDuplicateKey(new Error('connection reset'))).toBe(false);
        expect(isDuplicateKey(undefined)).toBe(false);
    });

    it('does not treat a near-miss code as a duplicate', () => {
        expect(isDuplicateKey(Object.assign(new Error('x'), { code: 11_001 }))).toBe(false);
    });
});

describe('isConnectionError', () => {
    it.each([
        'MongoServerSelectionError',
        'MongooseServerSelectionError',
        'MongoNetworkError',
        'MongoNotConnectedError',
        'MongoNetworkTimeoutError'
    ])('recognises %s by name, never instanceof', (name) => {
        expect(isConnectionError(Object.assign(new Error('unreachable'), { name }))).toBe(true);
    });

    it('recognises the bare MongooseError buffering-timeout message', () => {
        const error = new mongoose.Error(
            'Operation `users.findOne()` buffering timed out after 10000ms'
        );
        expect(isConnectionError(error)).toBe(true);
    });

    it('is false for a bare MongooseError that is a programmer error, not an outage', () => {
        // The base class every other Mongoose throw also uses — the message is the only signal,
        // and an unrelated one must not be mistaken for the outage case above.
        expect(isConnectionError(new mongoose.Error('Aggregate has empty pipeline'))).toBe(false);
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isConnectionError(new Error('validation failed'))).toBe(false);
        expect(isConnectionError(undefined)).toBe(false);
    });
});
