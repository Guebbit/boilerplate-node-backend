/**
 * @module
 * The real doors into `account.sessions-revoked`: logout everywhere and a password reset, driven
 * over HTTP, each taking the keys the person minted with them. The event handling itself is covered
 * in `api-keys.test.ts`; this proves `account` actually emits it where the epoch moves.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { credentialOf } from '@tests/credentials';
import apiKeysModule from '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import type { TenantCallerContext } from '@types';

setupTestDb();

// Installs the credential resolver, as a real boot does once the module is enabled.
apiKeysModule.onRegistered?.();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'log' });
});

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
            system: false,
            level: 'admin'
        },
        analyticsConsent: false
    };
    const minted = await mint(
        {
            name: 'ci',
            permissions: ['apikeys.any.read'],
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

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('a completed password reset revokes them too', async () => {
        const { user, secret } = await adminWithKey();
        await user.tokenAdd('password', 3_600_000, 'reset-revokes-keys');

        const response = await api().post('/account/reset-confirm').send({
            token: 'reset-revokes-keys',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeUndefined();
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
