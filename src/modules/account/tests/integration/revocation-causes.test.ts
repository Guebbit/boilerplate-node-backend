/**
 * @module
 * The `REVOCATION` table against the real doors: one trigger per cause, and everything the cause's
 * row claims is checked on what happened. A row that says `pending` purges links, `announce`
 * writes the outbox row, `callerKeeps` leaves the caller one live session. A cause added to the
 * table without a trigger here does not compile.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { codeFor } from '@tests/totp';
import { cookieHeader } from '@tests/cookies';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { REVOCATION, type RevocationCause } from '../../domain/revocation';
import { rotateRefreshToken, startSession, TokenReuseError } from '../../session/jwt';
import { plantToken, sessionRowsOf, tokenTypesOf } from '../factories';

setupTestDb();

beforeEach(() => {
    setEnvironment({
        NODE_MAIL_TRANSPORT: 'outbox',
        NODE_TOKEN_ROTATION_GRACE_MS: '1',
        NODE_TOKEN_REUSE_WINDOW_MS: '600000'
    });
});

/** One second and a little, so tokens already minted fall before an epoch set now. */
const PAST_THE_SECOND_MS = 1100;

/** Sleeps `ms`. */
const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** A login: the access token, and the refresh cookie as a `Cookie` header. */
const loginAs = async (email: string) => {
    const response = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    return {
        bearer: `Bearer ${response.body.data.token as string}`,
        cookie: cookieHeader(response, '__Host-session')
    };
};

/** What a trigger leaves for the assertions: whose account, the other device, and the cause itself. */
interface Scenario {
    userId: string;
    /** A bearer from another device, signed in before the cause fires. */
    victim: string;
    /** Fires the cause through its real door. */
    fire: () => Promise<void>;
}

/** Builds a scenario, with a pending link planted so `pending` has something to purge. */
type Trigger = () => Promise<Scenario>;

/** A verified account with a victim device and a pending verification link. */
const accountWithVictim = async (email: string) => {
    const user = await createUser({ verifiedAt: new Date(), email });
    await plantToken(user.id, 'verify', 'pending-verify', { ttlMs: 3_600_000 });
    return { user, victim: await loginAs(user.email) };
};

/** password-change: the real door. */
const viaPasswordChange: Trigger = async () => {
    const { user, victim } = await accountWithVictim('change@example.com');
    const caller = await loginAs(user.email);
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: () =>
            api()
                .post('/account/password')
                .set('Authorization', caller.bearer)
                .set('Cookie', caller.cookie)
                .send({
                    currentPassword: PLAIN_PASSWORD,
                    password: REPLACEMENT_PASSWORD,
                    passwordConfirm: REPLACEMENT_PASSWORD
                })
                .then(() => undefined)
    };
};

/** password-reset: the real door. */
const viaPasswordReset: Trigger = async () => {
    const { user, victim } = await accountWithVictim('reset@example.com');
    await plantToken(user.id, 'password', 'reset-me', { ttlMs: 3_600_000 });
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: () =>
            api()
                .post('/account/reset-confirm')
                .send({
                    token: 'reset-me',
                    password: REPLACEMENT_PASSWORD,
                    passwordConfirm: REPLACEMENT_PASSWORD
                })
                .then(() => undefined)
    };
};

/** logout-all: the real door. */
const viaLogoutAll: Trigger = async () => {
    const { user, victim } = await accountWithVictim('everywhere@example.com');
    const caller = await loginAs(user.email);
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: () =>
            api()
                .post('/account/logout-all')
                .set('Authorization', caller.bearer)
                .set('Cookie', caller.cookie)
                .then(() => undefined)
    };
};

/** email-change-confirm: the real door. */
const viaEmailConfirm: Trigger = async () => {
    const { user, victim } = await accountWithVictim('confirm@example.com');
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { pendingEmail: 'confirmed@example.com' } }
    );
    await plantToken(user.id, 'email-change', 'confirm-me', { ttlMs: 3_600_000 });
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: () =>
            api()
                .post('/account/email-change-confirm')
                .send({ token: 'confirm-me' })
                .then(() => undefined)
    };
};

/** email-change-undo: the real door. */
const viaEmailUndo: Trigger = async () => {
    const { user, victim } = await accountWithVictim('new@example.com');
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { previousEmail: 'old@example.com' } }
    );
    await plantToken(user.id, 'email-change-undo', 'undo-me', { ttlMs: 3_600_000 });
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: () =>
            api()
                .post('/account/email-change-undo')
                .send({ token: 'undo-me' })
                .then(() => undefined)
    };
};

/** two-factor-change: the real door. */
const viaTwoFactorConfirm: Trigger = async () => {
    const { user, victim } = await accountWithVictim('factor@example.com');
    const caller = await loginAs(user.email);
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', caller.bearer)
        .send();
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: async () => {
            await api()
                .post('/account/2fa/methods/totp/confirm')
                .set('Authorization', caller.bearer)
                .set('Cookie', caller.cookie)
                .send({ code: await codeFor(setup.body.data.secret as string, 0) });
        }
    };
};

/** refresh-reuse: the real door. */
const viaRefreshReuse: Trigger = async () => {
    const { user, victim } = await accountWithVictim('reuse@example.com');
    const stolen = await startSession(user.id, ['pwd']);
    await rotateRefreshToken(stolen);
    return {
        userId: user.id,
        victim: victim.bearer,
        fire: async () => {
            // Replaying a superseded token past the grace window is theft.
            await sleep(20);
            await expect(rotateRefreshToken(stolen)).rejects.toBeInstanceOf(TokenReuseError);
        }
    };
};

/** The real door for each cause. */
const TRIGGERS: Record<RevocationCause, Trigger> = {
    'password-change': viaPasswordChange,
    'password-reset': viaPasswordReset,
    'logout-all': viaLogoutAll,
    'email-change-confirm': viaEmailConfirm,
    'email-change-undo': viaEmailUndo,
    'two-factor-change': viaTwoFactorConfirm,
    'refresh-reuse': viaRefreshReuse
};

/** Whether a bearer still opens `GET /account`. */
const works = (bearer: string): Promise<boolean> =>
    api()
        .get('/account')
        .set('Authorization', bearer)
        .then((response) => response.status === 200);

describe.each(Object.keys(REVOCATION) as RevocationCause[])('cause %s', (cause) => {
    const row = REVOCATION[cause];

    it('ends the other device, as its row says', async () => {
        const { userId, victim, fire } = await TRIGGERS[cause]();
        await sleep(PAST_THE_SECOND_MS);

        await fire();
        await settleOutboxNudges();

        expect(await works(victim)).toBe(false);
        // The caller keeps exactly one session when the row says so; nobody does otherwise.
        expect(await sessionRowsOf(userId)).toHaveLength(row.callerKeeps ? 1 : 0);
        const kept = await tokenTypesOf(userId);
        expect(kept.includes('verify')).toBe(!row.pending);
        const announced = await outboxEventModel.find({ name: 'account.sessions-revoked' }).lean();
        expect(announced.map(({ payload }) => payload)).toEqual(
            row.announce ? [{ userId, reason: cause }] : []
        );
    });
});
