/**
 * The shared helpers every module's `factories.ts` is built from.
 *
 * These three functions decide what a seeded record MEANS when a field was left out, and each one
 * has a failure that is silent by construction:
 *
 *   - `toObjectId` turns a hex string into a real BSON id. A string that stayed a string matches
 *     nothing inside an aggregation `$match` — the same failure `orderService.callerScope` guards
 *     at the other end — and reads as "no such record" rather than as an error.
 *   - `toDate` accepts what the seed files actually write — ISO strings — while passing a `Date`
 *     through untouched.
 *   - `identityOf` derives `createdAt` from the id's own embedded timestamp when none is given,
 *     which is what makes a seeded catalogue sort in a stable, meaningful order instead of all
 *     sharing the instant the seeder ran.
 */
import { Types } from 'mongoose';
import { toDate, toObjectId, identityOf } from '@infrastructure/persistence/factories';

const HEX = '65dc8a99604c307b702b5ccc';

describe('toObjectId', () => {
    it('turns a hex string into a real ObjectId with the same value', () => {
        const id = toObjectId(HEX);

        // Both halves: a plain string would satisfy a loose comparison and still match zero
        // documents inside a pipeline.
        expect(id).toBeInstanceOf(Types.ObjectId);
        expect(String(id)).toBe(HEX);
    });

    it('mints a fresh id when none is given', () => {
        // A row that names no id still has to be insertable, and two of them must not collide.
        const first = toObjectId();
        const second = toObjectId();

        expect(first).toBeInstanceOf(Types.ObjectId);
        expect(String(first)).not.toBe(String(second));
    });

    it('throws on a malformed id rather than minting a random one', () => {
        // The dangerous alternative: silently substituting a new id would seed a record nothing
        // else can reference, and the broken reference would surface far from here.
        expect(() => toObjectId('not-an-object-id')).toThrow();
    });
});

describe('toDate', () => {
    it('parses an ISO string, which is what the seed files write', () => {
        const parsed = toDate('2026-08-27T10:00:00.000Z');

        expect(parsed).toBeInstanceOf(Date);
        expect(parsed!.toISOString()).toBe('2026-08-27T10:00:00.000Z');
    });

    it('passes a Date through as an equal Date', () => {
        const original = new Date('2026-08-27T10:00:00.000Z');

        expect(toDate(original)!.getTime()).toBe(original.getTime());
    });

    it('leaves undefined undefined, so stripUndefined can drop it', () => {
        // `new Date(undefined)` is an Invalid Date, which persists as `null` and reads as a
        // record with an explicitly unknown timestamp. The early return is what prevents that.
        expect(toDate(undefined)).toBeUndefined();
    });
});

describe('identityOf', () => {
    it('uses the id it is given', () => {
        expect(String(identityOf({ id: HEX })._id)).toBe(HEX);
    });

    it('derives createdAt from the id"s own embedded timestamp', () => {
        // The property that makes a seeded catalogue sort meaningfully: ids chosen months apart
        // produce records created months apart, without the seed files stating a date at all.
        const { _id, createdAt } = identityOf({ id: HEX });

        expect(createdAt.getTime()).toBe(_id.getTimestamp().getTime());
    });

    it('prefers an explicit createdAt over the derived one', () => {
        const { createdAt } = identityOf({ id: HEX, createdAt: '2020-01-01T00:00:00.000Z' });

        expect(createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    });

    it('defaults updatedAt to createdAt, so an untouched record reads as untouched', () => {
        // Not `new Date()`: a record seeded and never edited must not claim it was modified at
        // seed time, or every "recently changed" view lists the entire dataset.
        const { createdAt, updatedAt } = identityOf({ id: HEX });

        expect(updatedAt.getTime()).toBe(createdAt.getTime());
    });

    it('follows an explicit createdAt when updatedAt is left out', () => {
        const { createdAt, updatedAt } = identityOf({
            id: HEX,
            createdAt: '2020-01-01T00:00:00.000Z'
        });

        expect(updatedAt.getTime()).toBe(createdAt.getTime());
    });

    it('takes both timestamps when both are given', () => {
        const { createdAt, updatedAt } = identityOf({
            id: HEX,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2021-06-15T12:00:00.000Z'
        });

        expect(createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
        expect(updatedAt.toISOString()).toBe('2021-06-15T12:00:00.000Z');
    });

    it('still produces a complete identity with no overrides at all', () => {
        const { _id, createdAt, updatedAt } = identityOf({});

        expect(_id).toBeInstanceOf(Types.ObjectId);
        expect(createdAt).toBeInstanceOf(Date);
        expect(updatedAt.getTime()).toBe(createdAt.getTime());
    });
});
