/**
 * @module
 * A staff role grants nothing until an authenticator app is armed: the account keeps the customer's
 * powers and can enrol, the staff-only door says so in its own code, enrolling unlocks the role on
 * the next request, and losing the app takes the keys minted under it away.
 */
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { settleOutboxNudges } from '@kernel/outbox';
import { mint } from '@modules/api-keys/services/api-keys';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { setupTestDb } from '@tests/setup-test-db';
import { api, loginBearer } from '@tests/http';
import { armAuthenticator, TEST_AUTHENTICATOR_SECRET } from '@tests/authenticator';
import { credentialOf } from '@tests/credentials';
import { forgetSessionEpoch } from '@tests/session-epoch';
import { codeFor } from '@tests/totp';

setupTestDb();

/** A signed-in staff member who has not enrolled an app: the login answers a session, not a challenge. */
const unarmedStaff = async (role: string, email = `${role}@example.com`) => {
    const user = await createUser({ email, username: role, verifiedAt: new Date() }, role);
    const login = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    return { user, bearer: `Bearer ${login.body.data.token as string}` as const };
};

describe('a staff role without an authenticator app', () => {
    it('answers the staff door with the enrolment code, and the customer door as usual', async () => {
        const { bearer } = await unarmedStaff('manager');

        const staff = await api().get('/orders/export').set('Authorization', bearer);
        const own = await api().get('/account').set('Authorization', bearer);

        expect(staff.status).toBe(403);
        expect(staff.body.errors[0].code).toBe('SECOND_FACTOR_ENROLLMENT_REQUIRED');
        expect(own.status).toBe(200);
    });

    it('tells the client so on the abilities answer, and withholds the role’s rules', async () => {
        const { bearer } = await unarmedStaff('manager');

        const abilities = await api().get('/account/abilities').set('Authorization', bearer);

        expect(abilities.body.data.secondFactorRequired).toBe(true);
    });

    it('is not told apart from a plain refusal when the rule is not the role’s anyway', async () => {
        const { bearer } = await unarmedStaff('editor');

        const response = await api().get('/orders/export').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response.body.errors[0].code).toBe('FORBIDDEN');
    });

    it('is gated on the very next request when the role is granted to a signed-in customer', async () => {
        const user = await createUser({ verifiedAt: new Date() }, 'customer');
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        const bearer = `Bearer ${login.body.data.token as string}`;
        await accessService.assignRole(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'manager');

        const response = await api().get('/orders/export').set('Authorization', bearer);

        expect(response.body.errors[0].code).toBe('SECOND_FACTOR_ENROLLMENT_REQUIRED');
    });

    it('gates an operator’s platform door the same way', async () => {
        const user = await createUser({ verifiedAt: new Date() }, 'customer');
        await accessService.assignRole(user.id, null, 'platform', 'operator');
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        const response = await api()
            .get('/observability/audit')
            .set('Authorization', `Bearer ${login.body.data.token as string}`);

        expect(response.body.errors[0].code).toBe('SECOND_FACTOR_ENROLLMENT_REQUIRED');
    });

    it('is unlocked on the next request once the app is enrolled', async () => {
        const { bearer } = await unarmedStaff('manager');
        const setup = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', bearer)
            .send();
        const { secret } = setup.body.data as { secret: string };
        await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 0) })
            .expect(200);
        // Enrolling ends the session that did it; the suite keeps its bearer, a client swaps it.
        await forgetSessionEpoch(bearer);

        const staff = await api().get('/orders/export').set('Authorization', bearer);
        const abilities = await api().get('/account/abilities').set('Authorization', bearer);

        expect(staff.status).toBe(200);
        expect(abilities.body.data.secondFactorRequired).toBe(false);
    });
});

describe('what counts as an authenticator app', () => {
    it('arms the staff flag for an app and not for a mailed code', async () => {
        const app = await createUser({ email: 'app@example.com', username: 'app' }, 'manager');
        const mailed = await createUser({ email: 'mail@example.com', username: 'mail' }, 'manager');
        await armAuthenticator(app.id);
        const withMail = await userService.findByIdWithCredentials(mailed.id);
        withMail!.twoFactorMethods.push({ method: 'email', enrolledAt: new Date() });
        await userService.persistTwoFactorWrite(withMail!);

        const appRow = await userRepository.findById(app.id);
        const mailedRow = await userRepository.findById(mailed.id);

        expect(appRow?.authenticatorEnabledAt).toBeInstanceOf(Date);
        expect(mailedRow?.twoFactorEnabledAt).toBeInstanceOf(Date);
        expect(mailedRow?.authenticatorEnabledAt).toBeUndefined();
    });
});

/** An armed manager holding one key, and a bearer to switch the app off with. */
const managerWithKey = async () => {
    const user = await createUser(
        { email: 'keys@example.com', username: 'keys', verifiedAt: new Date() },
        'manager'
    );
    await armAuthenticator(user.id);
    const bearer = await loginBearer(user.email);
    const minted = await mint(
        {
            name: 'integration',
            permissions: ['display:Order'],
            expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()
        },
        {
            caller: {
                id: user.id,
                tenantId: DEPLOYMENT_TENANT_ID,
                scope: 'tenant',
                permissions: ['display:Order'],
                unrestricted: false,
                system: false
            },
            analyticsConsent: false
        }
    );
    if (!minted.success || !minted.data) throw new Error('mint failed in test setup');
    return { user, bearer, secret: minted.data.secret };
};

describe('losing the authenticator app', () => {
    it('revokes the keys the staff member minted under it', async () => {
        const { bearer, secret } = await managerWithKey();
        expect(await credentialOf(secret)).toBeDefined();

        await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: await codeFor(TEST_AUTHENTICATOR_SECRET, 0) })
            .expect(200);
        await settleOutboxNudges();

        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('lets a key minted by an account with no app hold no more than a customer does', async () => {
        const { user, secret } = await managerWithKey();
        await userRepository.updateMany(
            { _id: user.id },
            { $unset: { authenticatorEnabledAt: '', twoFactorMethods: '', twoFactorEnabledAt: '' } }
        );

        const resolved = await credentialOf(secret);

        expect(resolved?.caller.permissions).not.toContain('display:Order');
    });
});
