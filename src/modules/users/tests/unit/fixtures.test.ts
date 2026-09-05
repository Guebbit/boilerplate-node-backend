/**
 * @module
 * `makeUser`, the account fixture builder. `PLAIN_PASSWORD` stores the password in plaintext and
 * relies on the model's own pre-save hook to hash it; tests sign in with the same constant. A
 * hash stored directly here would be hashed again by the hook, failing login tests in a way that
 * reads as a broken login rather than a broken fixture.
 */
import { Types } from 'mongoose';
import { makeUser, PLAIN_PASSWORD } from '@modules/users/fixtures';
import { zodUserSchema } from '@modules/users';
import { createUserBodyPasswordMin } from '@api/schemas.zod';
import {
    LEGACY_PASSWORD,
    MINIMAL_PASSWORD,
    REPLACEMENT_PASSWORD,
    WEAK_PASSWORD
} from '@modules/users/tests/fixtures';

const HEX = '65dc8a99604c307b702b5ccc';

/** What every password-setting endpoint enforces, reduced to a yes/no. */
const satisfiesPolicy = (password: string): boolean =>
    zodUserSchema.pick({ password: true }).safeParse({ password }).success;

describe('makeUser', () => {
    it('builds a complete, insertable user with no overrides', () => {
        const user = makeUser();

        expect(user._id).toBeInstanceOf(Types.ObjectId);
        expect(user.username).toBe('testuser');
        expect(user.email).toBe('user@example.com');
    });

    it('stores the shared plaintext password, for the model hook to hash', () => {
        // The constant the login tests sign in with. A hash here would be hashed again.
        expect(makeUser().password).toBe(PLAIN_PASSWORD);
        expect(PLAIN_PASSWORD).not.toBe('');
    });

    it('lets an override replace any default', () => {
        const user = makeUser({ username: 'ada', email: 'ada@example.com' });

        expect(user.username).toBe('ada');
        expect(user.email).toBe('ada@example.com');
    });

    it('omits unspecified fields, leaving the schema"s defaults to apply', () => {
        const user = makeUser();

        for (const field of ['admin', 'verified', 'deletedAt', 'tokens'])
            expect(Object.hasOwn(user, field)).toBe(false);
    });

    it('keeps an explicit false rather than dropping it', () => {
        // `admin: false` and `verified: false` are the fixtures the authorization and
        // verification branches need, and both are falsy.
        const user = makeUser({ admin: false, verified: false });

        expect(user.admin).toBe(false);
        expect(user.verified).toBe(false);
    });

    it('converts a soft-delete timestamp from an ISO string', () => {
        const user = makeUser({ deletedAt: '2026-08-27T10:00:00.000Z' });

        expect(user.deletedAt).toBeInstanceOf(Date);
    });

    it('takes the id it is given and dates the record from it', () => {
        const user = makeUser({ id: HEX });

        expect(String(user._id)).toBe(HEX);
        expect(user.createdAt!.getTime()).toBe(new Types.ObjectId(HEX).getTimestamp().getTime());
    });
});

/**
 * The password vocabulary, checked against the REAL policy rather than a restatement of it.
 *
 * Tightening the policy still fails the tests that sign up with these values — that is unavoidable
 * and correct. What this adds is a failure naming WHICH constant stopped playing its part, so the
 * rest read as consequences rather than as unrelated 422s.
 */
describe('the password vocabulary', () => {
    it.each([
        ['PLAIN_PASSWORD', PLAIN_PASSWORD],
        ['REPLACEMENT_PASSWORD', REPLACEMENT_PASSWORD],
        ['MINIMAL_PASSWORD', MINIMAL_PASSWORD]
    ])('accepts %s as a settable password', (_name, password) => {
        expect(satisfiesPolicy(password)).toBe(true);
    });

    it.each([
        ['LEGACY_PASSWORD', LEGACY_PASSWORD],
        ['WEAK_PASSWORD', WEAK_PASSWORD]
    ])('rejects %s as a settable password', (_name, password) => {
        expect(satisfiesPolicy(password)).toBe(false);
    });

    it('keeps LEGACY_PASSWORD long enough to be an existing credential', () => {
        // It fails only on character classes. A password below the length floor could not have
        // been set under ANY past policy, so it would prove nothing about a legacy account.
        expect(LEGACY_PASSWORD.length).toBeGreaterThanOrEqual(createUserBodyPasswordMin);
    });

    it('keeps MINIMAL_PASSWORD exactly at the length floor', () => {
        // Its whole job is to be the shortest legal value. A longer one silently stops testing
        // the boundary.
        expect(MINIMAL_PASSWORD).toHaveLength(createUserBodyPasswordMin);
    });

    it('keeps every constant distinct', () => {
        const all = [
            PLAIN_PASSWORD,
            REPLACEMENT_PASSWORD,
            MINIMAL_PASSWORD,
            LEGACY_PASSWORD,
            WEAK_PASSWORD
        ];

        // A collision would make "the password changed" pass against an unchanged password.
        expect(new Set(all).size).toBe(all.length);
    });
});
