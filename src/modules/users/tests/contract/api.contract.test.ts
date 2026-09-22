/**
 * @module
 * Contract tests for /users and /account — the credential-leak guard. `openapi.yaml`'s `User`
 * schema declares `additionalProperties: false`, so any undeclared field on a user response
 * (password, tokens, a bcrypt hash) fails here, not just the ones we thought to name.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';

setupTestDb();

/*
 * The audit port is REPLACED, not spied on — `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes under swc. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

// Serializes the payload and checks for credential fields/values that must never leave the API.
const assertNoCredentials = (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('tokens');
    expect(serialized).not.toContain('$2b$'); // a bcrypt hash, however it got there
};

describe('GET /users', () => {
    it('matches the contract and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().get('/users').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    // `GET /users/:id` resolves `role` from the membership store; the list endpoint's own
    // serialization went through the document's `toJSON` transform instead, which has no role
    // to offer — every item in a page answered with `role` silently missing.
    it('carries each item’s role, the same as GET /users/:id does', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const response = await api().get('/users').set('Authorization', bearer);

        expect(response.status).toBe(200);
        const {
            data: { items }
        } = response.body as { data: { items: { id: string; role?: string }[] } };
        expect(items.find((item) => item.id === String(user._id))?.role).toBe('admin');
    });
});

// The `?role=` filter itself is gone — `role` is a membership fact now, not a searchable document
// column, and filtering by it needs a two-step resolve `createRepository`'s generic `exact` spec
// can't express. Deliberately not rebuilt here: no caller of `GET /users` needs it today.

describe('GET /users/{id}', () => {
    it('matches the contract and exposes no credentials', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const response = await api()
            .get(`/users/${String(user._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });
});

describe('GET /account', () => {
    it('matches the contract and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);

        // A profile is the caller's identity: a browser must never be told to keep a copy. See
        // `noStore` in `infrastructure/http/middlewares/cache.ts`.
        expect(response.headers['cache-control']).toBe('no-store');
    });
});

describe('POST /account/signup', () => {
    it('matches the contract for a new account and exposes no credentials', async () => {
        const response = await api().post('/account/signup').send({
            username: 'newcomer',
            email: 'newcomer@example.com',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    // 409, not 422: the request is well-formed, the address is already taken.
    it('matches the error contract for an email that is already registered', async () => {
        const payload = {
            username: 'duplicate',
            email: 'duplicate@example.com',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        };
        await api().post('/account/signup').send(payload);
        const response = await api().post('/account/signup').send(payload);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });
});

/**
 * These four cover password provisioning on admin create: supplied directly, deferred to
 * `sendSetupEmail`, or neither — which must 422 rather than silently create an unreachable account.
 */
describe('POST /users', () => {
    it('creates a user with a password supplied directly, and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'admin-created@example.com',
            username: 'admincreated',
            password: PLAIN_PASSWORD
        });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    it('creates a user with no password when sendSetupEmail is true', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'setup-email@example.com',
            username: 'setupemailuser',
            sendSetupEmail: true
        });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    it('matches the error contract for neither a password nor sendSetupEmail', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'no-way-in@example.com',
            username: 'nowayinuser'
        });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('accepts sendSetupEmail: false the same as omitting it', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'setup-false@example.com',
            username: 'setupfalseuser',
            sendSetupEmail: false
        });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    // B25: this 422 already fired on PUT (below); POST skipped the check entirely, so an admin
    // could hand a brand-new account a password already on every breach list.
    it('refuses a breached password, and creates no user row', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'breached-create@example.com',
            username: 'breachedcreateuser',
            // A listed, composition-valid entry in `breached-passwords/list.txt` — same fixture
            // `account/tests/integration/service-flows.test.ts` uses for its own breach case.
            password: 'Password1!'
        });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
        expect(
            await userRepository.findOne({ email: 'breached-create@example.com' })
        ).toBeNull();
    });
});

describe('PUT /users/{id}', () => {
    // Regression guard: the controller once defaulted `requirePassword` to true on updates too,
    // so an admin couldn't edit a user without resubmitting their password.
    it('updates a user without resubmitting a password', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'editnocredential',
            email: 'editnocredential@example.com'
        });

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ email: target.email, username: 'editednocredential' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    // B25: this path already ran the breach check inside `userService.update` — no behaviour
    // change here, only the missing contract-level coverage the box asks for.
    it('refuses a breached password', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'editbreached',
            email: 'editbreached@example.com'
        });

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ email: target.email, username: target.username, password: 'Password1!' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /users/{id} — the audit action names which discharge happened', () => {
    it('soft delete audits admin.user.soft_deleted, not an erasure', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'soft-delete@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'admin.user.soft_deleted',
                outcome: 'success',
                metadata: { hardDelete: false }
            })
        );
    });

    it('?hardDelete=true audits admin.user.erased — the one that discharges an Art. 17 request', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'hard-delete@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}?hardDelete=true`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'admin.user.erased',
                outcome: 'success',
                metadata: { hardDelete: true }
            })
        );
    });
});
