/**
 * @module
 * `makeUser` — the account fixture builder.
 *
 * `PLAIN_PASSWORD` is the interesting export: the fixture stores the password in PLAINTEXT and
 * relies on the model's own pre-save hashing to turn it into what is persisted. Tests then sign in
 * with the same constant. If this ever stored a hash directly, the hook would hash the hash and
 * every login test would fail in a way that reads as a broken login rather than a broken fixture.
 */
import { Types } from 'mongoose';
import { makeUser, PLAIN_PASSWORD } from '@modules/users/fixtures';

const HEX = '65dc8a99604c307b702b5ccc';

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
