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
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the
        // override above — reroute it through the replacement so a spy on `emitAuditEvent` still
        // sees every `recordAudit` call, exactly as it saw every direct one before.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

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
        expect(await userRepository.findOne({ email: 'breached-create@example.com' })).toBeNull();
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

    it('leaves an existing avatar untouched on a JSON edit that uploads no new image', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'editkeepsimage',
            email: 'editkeepsimage@example.com',
            imageUrl: 'https://cdn.example.com/avatars/original.png'
        });

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ email: target.email, username: 'editednocredential2' });

        expect(response.status).toBe(200);
        expect(response.body.data.imageUrl).toBe('https://cdn.example.com/avatars/original.png');
        expect(response).toSatisfyApiSpec();
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

/** DELETE is one-way and safe to retry; undoing a soft delete is its own verb. */
describe('POST /users/{id}/restore', () => {
    it('brings a soft-deleted user back, matching the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser({ deletedAt: new Date() });

        const response = await api()
            .post(`/users/${String(user._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect((await userRepository.findById(String(user._id)))!.deletedAt).toBeUndefined();
        expect(response).toSatisfyApiSpec();
    });

    it('answers 409 for a user who is not deleted', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser();

        const response = await api()
            .post(`/users/${String(user._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });
});

/*
 * The body-addressed twins of `PUT /users/{id}` and `DELETE /users/{id}`, the explicit hard
 * delete, the admin 2FA reset — and the refusals every one of them owes an anonymous caller.
 */
describe('PUT /users — the id in the body', () => {
    it('matches the contract for an admin edit', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'body-edit@example.com', username: 'bodyedit' });

        const response = await api()
            .put('/users')
            .set('Authorization', bearer)
            // `email` resent, as every PUT /users/{id} case here does: the service validates it as
            // present although `UpdateUserRequest` does not list it as required.
            .send({ id: String(target._id), email: target.email, username: 'bodyedited' });

        expect(response.status).toBe(200);
        expect(response.body.data.username).toBe('bodyedited');
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });
});

describe('DELETE /users — the id in the body', () => {
    it('matches the contract for a soft delete', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'body-delete@example.com' });

        const response = await api()
            .delete('/users')
            .set('Authorization', bearer)
            .send({ id: String(target._id) });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const stored = await userRepository.findById(String(target._id));
        expect(stored?.deletedAt).toBeInstanceOf(Date);
    });
});

describe('DELETE /users/{id}/hard', () => {
    it('matches the contract, and the row is gone rather than marked', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'erase-me@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}/hard`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        await expect(userRepository.findById(String(target._id))).resolves.toBeNull();
    });
});

describe('DELETE /users/{id}/2fa', () => {
    it('answers success for a user with no factor armed — the reset is idempotent', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'no-factor@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}/2fa`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when it disarms a factor the user had', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'locked-out@example.com' });
        // Armed directly: the admin reset is about the ROW, and the enrollment dance is
        // `account`'s own contract, covered there.
        const stored = await userRepository.findByIdWithCredentials(String(target._id));
        stored!.twoFactorMethods.push({ method: 'email', enrolledAt: new Date() });
        stored!.twoFactorEnabledAt = new Date();
        await userRepository.save(stored!);

        const response = await api()
            .delete(`/users/${String(target._id)}/2fa`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const after = await userRepository.findByIdWithCredentials(String(target._id));
        expect(after!.twoFactorMethods).toEqual([]);
    });
});

describe.each([
    ['GET', '/users'],
    ['POST', '/users/search'],
    ['GET', '/users/65dc8a99604c307b702b5ccc'],
    ['DELETE', '/users/65dc8a99604c307b702b5ccc'],
    ['DELETE', '/users/65dc8a99604c307b702b5ccc/hard']
] as const)('%s %s with no credentials', (method, path) => {
    it('matches the error contract', async () => {
        const response =
            await api()[method === 'GET' ? 'get' : method === 'POST' ? 'post' : 'delete'](path);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('an id nobody holds', () => {
    it.each([
        ['DELETE', '/users/65dc8a99604c307b702b5ccc/hard'],
        ['DELETE', '/users/65dc8a99604c307b702b5ccc/2fa']
    ] as const)('%s %s matches the 404 contract', async (_method, path) => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().delete(path).set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});
