/**
 * Driver-level Mongo error facts — `src/infrastructure/persistence/mongo-errors.ts`.
 */

import mongoose from 'mongoose';
import { isDuplicateKey, isBadObjectId } from '@infrastructure/persistence/mongo-errors';

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

describe('isBadObjectId', () => {
    it('recognises a CastError on the ObjectId path', () => {
        const error = new mongoose.Error.CastError('ObjectId', 'not-an-id', 'id');
        expect(isBadObjectId(error)).toBe(true);
    });

    it('is false for a CastError on a different path — a bad id is not every cast failure', () => {
        const error = new mongoose.Error.CastError('Number', 'abc', 'quantity');
        expect(isBadObjectId(error)).toBe(false);
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isBadObjectId(new Error('connection reset'))).toBe(false);
        expect(isBadObjectId(undefined)).toBe(false);
    });

    it('is false for a plain object merely shaped like a CastError', () => {
        // The whole reason for `instanceof` over duck-typing here: a fixture or a hand-built
        // rejection that only LOOKS like one must not pass — that gap is exactly what motivated
        // the widened `unknown` catch this helper exists to narrow safely.
        expect(isBadObjectId({ name: 'CastError', kind: 'ObjectId' })).toBe(false);
    });
});
