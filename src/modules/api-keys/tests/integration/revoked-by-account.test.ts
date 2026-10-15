/**
 * @module
 * The real doors into `account.sessions-revoked`: logout everywhere and a password reset, driven
 * over HTTP, each taking the keys the person minted with them. The event handling itself is covered
 * in `api-keys.test.ts`; this proves `account` actually emits it where the epoch moves.
 */

import { api } from '@tests/http';
import { cookieHeader } from '@tests/cookies';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { credentialOf } from '@tests/credentials';
import apiKeysModule from '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { settleOutboxNudges } from '@kernel/outbox';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import type { TenantCallerContext } from '@types';
import { plantToken, sessionRowsOf } from '@modules/account/tests/factories';

setupTestDb();

// Installs the credential resolver, as a real boot does once the module is enabled.
apiKeysModule.onRegistered?.();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'log', NODE_CORS_ORIGIN: FRONTEND });
});

/** The one allowed frontend origin of this file. */
const FRONTEND = 'https://shop.example';

/** An admin who has minted one live credential: the user, a login bearer, the key's secret. */
const adminWithKey = async () => {
    const user = await createUser({ verifiedAt: new Date() }, 'admin');
    const context: TenantCallerContext = {
        caller: {
            id: user.id,
            tenantId: DEPLOYMENT_TENANT_ID,
            scope: 'tenant',
            permissions: permissionsOfRole('admin'),
            unrestricted: false,
            system: false
        },
        analyticsConsent: false
    };
    const minted = await mint(
        {
            name: 'ci',
            permissions: ['read:WebhookSubscription'],
            expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()
        },
        context
    );
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return {
        user,
        bearer: `Bearer ${login.body.data.token as string}`,
        secret: minted.data?.secret ?? ''
    };
};

describe('keys end with the sessions that may be compromised', () => {
    it('logging out everywhere revokes the keys the person minted', async () => {
        const { bearer, secret } = await adminWithKey();
        expect(await credentialOf(secret)).toBeDefined();

        const response = await api().post('/account/logout-all').set('Authorization', bearer);

        // The event rides the outbox: the relay delivers it right after the commit.
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('a completed password reset revokes them too', async () => {
        const { user, secret } = await adminWithKey();
        await plantToken(user.id, 'password', 'reset-revokes-keys', { ttlMs: 3_600_000 });

        const response = await api().post('/account/reset-confirm').send({
            token: 'reset-revokes-keys',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        // The event rides the outbox: the relay delivers it right after the commit.
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('reporting an email change as not theirs revokes them too', async () => {
        const { user, secret } = await adminWithKey();
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { previousEmail: 'before@example.com' } }
        );
        await plantToken(user.id, 'email-change-undo', 'undo-revokes-keys', { ttlMs: 3_600_000 });

        const response = await api()
            .post('/account/email-change-undo')
            .send({ token: 'undo-revokes-keys' });
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('a replayed refresh token signs every device out but leaves the keys alone', async () => {
        const { user, secret } = await adminWithKey();
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        const stale = cookieHeader(login, '__Host-session');
        await api().post('/account/refresh').set('Origin', FRONTEND).set('Cookie', stale);
        // No grace left: the swapped-away token now reads as theft, not as a second tab.
        setEnvironment({ NODE_TOKEN_ROTATION_GRACE_MS: '0' });

        const replay = await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', stale);
        await settleOutboxNudges();

        expect(replay.status).toBe(401);
        expect(await sessionRowsOf(user.id)).toEqual([]);
        // A key belongs to a deliberate act, not to a browser: only the owner's "log out
        // everywhere", a reset or an undo ends it, since a thief of one refresh token is no proof
        // the key was seen.
        expect(await credentialOf(secret)).toBeDefined();
    });

    it('an ordinary password change does not: the owner proved the current password', async () => {
        const { bearer, secret } = await adminWithKey();

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeDefined();
    });
});
