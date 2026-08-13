/**
 * The self-service account surface — profile update, authenticated password change, session
 * revocation and email verification — at the service/repository layer.
 *
 * Grouped by the invariant each defends rather than by function, like `service.test.ts`:
 *
 *   - a profile update must not be able to touch role, account state or password;
 *   - changing the email must unverify the account, or one confirmed mailbox launders any
 *     number of addresses;
 *   - a wrong current password must be a 422, never a 401 — a 401 logs the user out of a
 *     session that is perfectly valid;
 *   - a session handle must revoke REFRESH tokens only, or the id from a sessions listing
 *     cancels a pending reset/delete/verify token it was never meant to reach;
 *   - at most one verification link may work at a time, and it must be the newest.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';
import { authService, passwordChangeWithCurrent, updateProfile } from '@modules/account/service';
import { sendVerificationEmail, EMAIL_VERIFY_TOKEN_TYPE } from '@modules/account/verification';
import { userRepository, ETokenType } from '@modules/users';
import type { IUserDocument } from '@modules/users';
import type { IResponseReject, IResponseSuccess } from '@infrastructure/http/response';

setupTestDb();

const CURRENT_PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'staple-gun-tuesday';

/** Narrow to the reject arm, failing the test (rather than the type check) when it succeeded. */
const asReject = (response: IResponseSuccess<IUserDocument> | IResponseReject): IResponseReject => {
    expect(response.success).toBe(false);
    return response as IResponseReject;
};

/** Narrow to the success arm, and to a present `data`. */
const asSuccess = (
    response: IResponseSuccess<IUserDocument> | IResponseReject
): IResponseSuccess<IUserDocument> & { data: IUserDocument } => {
    expect(response.success).toBe(true);
    return response as IResponseSuccess<IUserDocument> & { data: IUserDocument };
};

/** The stored tokens of a user, credentials re-selected. */
const readTokens = async (userId: string) => {
    const stored = await userRepository.findByIdWithCredentials(userId);
    return stored?.tokens ?? [];
};

describe('updateProfile', () => {
    it('updates the fields a user owns', async () => {
        const user = await createUser({ email: 'own@example.com' });

        const response = asSuccess(
            await updateProfile(user.id, { username: 'renamed', locale: 'it' })
        );

        expect(response.data.username).toBe('renamed');
        expect(response.data.locale).toBe('it');
        // Untouched fields stay put — an absent field means "leave it alone".
        expect(response.data.email).toBe('own@example.com');
    });

    it('rejects an invalid email with 422', async () => {
        const user = await createUser();

        const response = asReject(await updateProfile(user.id, { email: 'not-an-email' }));

        expect(response.status).toBe(422);
    });

    it('answers 404 for an account that no longer exists', async () => {
        const user = await createUser();
        await userRepository.deleteOne(user);

        const response = asReject(await updateProfile(user.id, { username: 'ghost' }));

        expect(response.status).toBe(404);
    });

    it('cannot escalate: admin, active and password do not pass through', async () => {
        const user = await createUser();

        asSuccess(
            await updateProfile(user.id, {
                username: 'still-plain',
                admin: true,
                active: false,
                password: 'injected-password'
            })
        );

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.admin).toBe(false);
        expect(stored?.active).toBe(true);
        // The password is untouched — the factory's original still logs in.
        const login = await authService.login(user.email, PLAIN_PASSWORD);
        expect(login.success).toBe(true);
    });

    it('unverifies the account when the email changes', async () => {
        const user = await createUser({ email: 'before@example.com', verified: true });

        const response = asSuccess(await updateProfile(user.id, { email: 'after@example.com' }));

        expect(response.data.verified).toBe(false);
    });

    it('keeps the verification when the email is restated unchanged', async () => {
        const user = await createUser({ email: 'same@example.com', verified: true });

        const response = asSuccess(await updateProfile(user.id, { email: 'same@example.com' }));

        expect(response.data.verified).toBe(true);
    });

    it('answers the unique index with 409 when the email belongs to someone else', async () => {
        await createUser({ email: 'taken@example.com', username: 'first' });
        const user = await createUser({ email: 'second@example.com', username: 'second' });

        const response = asReject(await updateProfile(user.id, { email: 'taken@example.com' }));

        expect(response.status).toBe(409);
    });
});

describe('passwordChangeWithCurrent', () => {
    it('changes the password when the current one matches', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        asSuccess(
            await passwordChangeWithCurrent(user.id, CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD)
        );

        // The new credential works and the old one is dead — both directions, or the test
        // passes on a no-op.
        const withNew = await authService.login(user.email, NEW_PASSWORD);
        const withOld = await authService.login(user.email, CURRENT_PASSWORD);
        expect(withNew.success).toBe(true);
        expect(withOld.success).toBe(false);
    });

    it('answers a wrong current password with 422, not 401', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(user.id, 'wrong-guess', NEW_PASSWORD, NEW_PASSWORD)
        );

        expect(response.status).toBe(422);
        // And nothing changed.
        const login = await authService.login(user.email, CURRENT_PASSWORD);
        expect(login.success).toBe(true);
    });

    it('validates the new pair before spending a bcrypt comparison', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(user.id, CURRENT_PASSWORD, NEW_PASSWORD, 'different')
        );

        expect(response.status).toBe(422);
        const login = await authService.login(user.email, CURRENT_PASSWORD);
        expect(login.success).toBe(true);
    });
});

describe('sessionRemove', () => {
    it('revokes exactly the named refresh token', async () => {
        const user = await createUser();
        await user.tokenAdd(ETokenType.REFRESH, 60_000, 'refresh-a');
        await user.tokenAdd(ETokenType.REFRESH, 60_000, 'refresh-b');

        const tokens = await readTokens(user.id);
        const target = tokens.find((token) => token.token === 'refresh-a');

        const result = await userRepository.sessionRemove(user.id, String(target?._id));

        expect(result.modifiedCount).toBe(1);
        const remaining = await readTokens(user.id);
        expect(remaining.map(({ token }) => token)).toEqual(['refresh-b']);
    });

    it('does not reach the other token kinds through a session handle', async () => {
        const user = await createUser();
        await user.tokenAdd('password', 60_000, 'pending-reset');

        const tokens = await readTokens(user.id);
        const result = await userRepository.sessionRemove(user.id, String(tokens[0]?._id));

        expect(result.modifiedCount).toBe(0);
        expect(await readTokens(user.id)).toHaveLength(1);
    });

    it("cannot revoke another user's session", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const attacker = await createUser({ email: 'attacker@example.com', username: 'attacker' });
        await owner.tokenAdd(ETokenType.REFRESH, 60_000, 'owner-session');

        const [ownerToken] = await readTokens(owner.id);
        const result = await userRepository.sessionRemove(attacker.id, String(ownerToken?._id));

        expect(result.modifiedCount).toBe(0);
        expect(await readTokens(owner.id)).toHaveLength(1);
    });
});

describe('tokenRemoveByValue', () => {
    it('removes one session and leaves the siblings', async () => {
        const user = await createUser();
        await user.tokenAdd(ETokenType.REFRESH, 60_000, 'phone');
        await user.tokenAdd(ETokenType.REFRESH, 60_000, 'laptop');

        await userRepository.tokenRemoveByValue('phone');

        const remaining = await readTokens(user.id);
        expect(remaining.map(({ token }) => token)).toEqual(['laptop']);
    });

    it('reports an already-spent value as a no-op', async () => {
        const result = await userRepository.tokenRemoveByValue('never-issued');

        expect(result.modifiedCount).toBe(0);
    });
});

describe('sendVerificationEmail', () => {
    it('issues exactly one verify token, replacing any earlier one', async () => {
        const user = await createUser();

        await sendVerificationEmail(user);
        const firstTokens = await readTokens(user.id);
        const first = firstTokens.find(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE);

        await sendVerificationEmail(user);
        const secondTokens = await readTokens(user.id);
        const verifyTokens = secondTokens.filter(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE);

        // One live link at any moment, and it is the NEWEST one — the re-send exists for the
        // user whose first mail vanished.
        expect(verifyTokens).toHaveLength(1);
        expect(verifyTokens[0]?.token).not.toBe(first?.token);
    });

    it('leaves the other token kinds alone', async () => {
        const user = await createUser();
        await user.tokenAdd(ETokenType.REFRESH, 60_000, 'live-session');

        await sendVerificationEmail(user);

        const tokens = await readTokens(user.id);
        expect(tokens.find(({ token }) => token === 'live-session')).toBeDefined();
    });
});
