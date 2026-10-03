/**
 * @module
 * Contract tests for /users and /account — the credential-leak guard. `openapi.yaml`'s `User`
 * schema declares `additionalProperties: false`, so any undeclared field on a user response
 * (password, tokens, a bcrypt hash) fails here, not just the ones we thought to name.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { USER_SETUP_REQUESTED } from '../../events';

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
        assertNoCredentials(response.body);
    });
});

describe('GET /account', () => {
    it('matches the contract and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
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
    });
});

/**
 * An admin creates an account, never a password: the owner chooses theirs through the setup
 * email, so the body carries neither a `password` nor a `sendSetupEmail` switch.
 */
describe('POST /users', () => {
    afterEach(() => {
        resetDomainEvents();
    });

    it('creates a user without a password, exposes no credentials, and mails the owner a setup link', async () => {
        const seen: string[] = [];
        onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
            seen.push(userId);
        });
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'admin-created@example.com',
            username: 'admincreated'
        });

        expect(response.status).toBe(201);
        assertNoCredentials(response.body);
        expect(seen).toEqual([(response.body as { data: { id: string } }).data.id]);
    });

    it.each([
        ['password', { password: PLAIN_PASSWORD }],
        ['sendSetupEmail', { sendSetupEmail: true }]
    ])('refuses a %s in the body with a 422 and creates nobody', async (_field, extra) => {
        const { bearer } = await authenticateAs('admin');
        const email = 'credential-field@example.com';

        const response = await api()
            .post('/users')
            .set('Authorization', bearer)
            .send({ email, username: 'credentialfield', ...extra });

        expect(response.status).toBe(422);
        expect(await userRepository.findOne({ email })).toBeNull();
    });

    /*
     * Every one of these is a real column the create path would have written from a raw body:
     * unverifying the account, consenting on the user's behalf, or a plaintext phone the
     * presenter cannot decrypt — a 500 on this response and on every later read of the user.
     */
    it.each([
        ['verifiedAt', { verifiedAt: null }],
        ['analyticsConsent', { analyticsConsent: true }],
        ['phone', { phone: '+390000000000' }]
    ])('refuses an undeclared %s with a 422 and creates nobody', async (_field, extra) => {
        const { bearer } = await authenticateAs('admin');
        const email = 'undeclared-field@example.com';

        const response = await api()
            .post('/users')
            .set('Authorization', bearer)
            .send({ email, username: 'undeclaredfield', ...extra });

        expect(response.status).toBe(422);
        expect(await userRepository.findOne({ email })).toBeNull();
    });

    // The paths that can set a password are listed, with their breach checks, in
    // `tests/contract/password-set-paths.test.ts`: `POST /users` is not one of them.
});

describe('PUT /users/{id}', () => {
    // A PUT body IS the new resource (RFC 9110 §9.3.4) — every omitted optional field is
    // cleared, not left alone. `imageUrl` is the exception: it belongs to an upload, so it is
    // left out of this body and survives it.
    it('replaces every writable field, clearing every omitted optional one', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            {
                username: 'replacefull',
                email: 'replacefull@example.com',
                imageUrl: 'https://cdn.example.com/avatars/original.png',
                phone: '+15551234567'
            },
            'customer'
        );

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({
                username: 'replacedfull',
                role: 'customer',
                active: true
            });

        expect(response.status).toBe(200);
        expect(response.body.data.imageUrl).toBe('https://cdn.example.com/avatars/original.png');
        expect(response.body.data.phone).toBeUndefined();
    });

    // `username`/`role`/`active` are the Replace schema's `required` set — an omitted one is a
    // malformed PUT, not a value to fill in.
    it('refuses a body missing one of the required identity fields', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'replacepartial', email: 'replacepartial@example.com' },
            'customer'
        );

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ role: 'customer' });

        expect(response.status).toBe(422);
    });

    it('updates a user with no credential in the body', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'editnocredential', email: 'editnocredential@example.com' },
            'customer'
        );

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({
                username: 'editednocredential',
                role: 'customer',
                active: true
            });

        expect(response.status).toBe(200);
        assertNoCredentials(response.body);
    });

    // A credential is its owner's alone: neither is a declared field, so the strict schema
    // refuses it and the stored values stay as they were.
    it.each([
        ['email', { email: 'taken-over@example.com' }],
        ['password', { password: PLAIN_PASSWORD }]
    ])('refuses a %s with a 422 and changes nothing', async (field, extra) => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'putcredential', email: 'putcredential@example.com' },
            'customer'
        );
        const before = await userRepository.findByIdWithCredentials(String(target._id));

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ username: 'putcredential', role: 'customer', active: true, ...extra });

        expect(response.status).toBe(422);
        const after = await userRepository.findByIdWithCredentials(String(target._id));
        expect(after?.email).toBe(before?.email);
        expect(after?.password).toBe(before?.password);
        expect(field).toBeDefined();
    });
});

describe('PATCH /users/{id}', () => {
    it('merges only the given field, leaving email and username unchanged', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'patchrole', email: 'patchrole@example.com' },
            'customer'
        );

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ role: 'moderator' });

        expect(response.status).toBe(200);
        expect(response.body.data.role).toBe('moderator');
        expect(response.body.data.email).toBe(target.email);
        expect(response.body.data.username).toBe(target.username);
    });

    it('leaves an existing avatar untouched on a JSON edit that uploads no new image', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'patchkeepsimage',
            email: 'patchkeepsimage@example.com',
            imageUrl: 'https://cdn.example.com/avatars/original.png'
        });

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ username: 'patcheditkeepsimage' });

        expect(response.status).toBe(200);
        expect(response.body.data.imageUrl).toBe('https://cdn.example.com/avatars/original.png');
    });

    it('null clears an optional field', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'patchclearsphone',
            email: 'patchclearsphone@example.com',
            phone: '+15551234567'
        });

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ phone: null });

        expect(response.status).toBe(200);
        expect(response.body.data.phone).toBeUndefined();
    });

    it('"" is refused, never a synonym for null', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'patchemptyphone',
            email: 'patchemptyphone@example.com'
        });

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ phone: '' });

        expect(response.status).toBe(422);
    });

    it.each([
        ['email', { email: 'taken-over@example.com' }],
        ['password', { password: PLAIN_PASSWORD }]
    ])('refuses a %s with a 422 and changes nothing', async (_field, extra) => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'patchcredential', email: 'patchcredential@example.com' },
            'customer'
        );
        const before = await userRepository.findByIdWithCredentials(String(target._id));

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send(extra);

        expect(response.status).toBe(422);
        const after = await userRepository.findByIdWithCredentials(String(target._id));
        expect(after?.email).toBe(before?.email);
        expect(after?.password).toBe(before?.password);
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
    });

    it('answers 409 for a user who is not deleted', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser();

        const response = await api()
            .post(`/users/${String(user._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
    });
});

/*
 * The body-addressed twin of `DELETE /users/{id}`, the explicit hard delete — and the refusals
 * every one of them owes an anonymous caller.
 */
describe('DELETE /users — the id in the body', () => {
    it('matches the contract for a soft delete', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'body-delete@example.com' });

        const response = await api()
            .delete('/users')
            .set('Authorization', bearer)
            .send({ id: String(target._id) });

        expect(response.status).toBe(200);
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
        await expect(userRepository.findById(String(target._id))).resolves.toBeNull();
    });
});

/**
 * There is no staff path to a second factor: the owner removes it with a code, and a lost one is
 * fixed by hand in the database. The route that once did it is gone, not merely guarded.
 */
describe('DELETE /users/{id}/2fa', () => {
    it('is not a route any more', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'no-factor@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}/2fa`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
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
    });
});

describe('an id nobody holds', () => {
    it.each([['DELETE', '/users/65dc8a99604c307b702b5ccc/hard']] as const)(
        '%s %s matches the 404 contract',
        async (_method, path) => {
            const { bearer } = await authenticateAs('admin');

            const response = await api().delete(path).set('Authorization', bearer);

            expect(response.status).toBe(404);
        }
    );
});

const emailsOf = (response: { body: { data: { items: { email: string }[] } } }) =>
    response.body.data.items
        .map((user) => user.email)
        .filter((email) => email.endsWith('@sort.test'));

describe('GET /users — sort', () => {
    it('orders by email in either direction, and answers 422 for a column outside the whitelist', async () => {
        await createUser({ email: 'b@sort.test' });
        await createUser({ email: 'A@sort.test' });
        await createUser({ email: 'c@sort.test' });
        const { bearer } = await authenticateAs('admin');

        const up = await api().get('/users?sort=email').set('Authorization', bearer);
        const down = await api()
            .post('/users/search')
            .set('Authorization', bearer)
            .send({ sort: ['-email'] });
        const refused = await api().get('/users?sort=password').set('Authorization', bearer);

        expect(emailsOf(up).map((email) => email.toLowerCase())).toEqual([
            'a@sort.test',
            'b@sort.test',
            'c@sort.test'
        ]);
        expect(emailsOf(down).map((email) => email.toLowerCase())).toEqual([
            'c@sort.test',
            'b@sort.test',
            'a@sort.test'
        ]);
        expect(refused.status).toBe(422);
    });
});

/** Creates one account per role and returns the list's `actions`, by username. */
const actionsSeenBy = async (callerRole: string) => {
    const { bearer, user } = await authenticateAsRole(callerRole);
    await Promise.all(
        ['customer', 'support', 'admin'].map((role) =>
            createUser({ email: `${role}@row.test`, username: `row-${role}` }, role)
        )
    );

    const response = await api().get('/users?pageSize=50').set('Authorization', bearer);
    const { items } = (
        response.body as {
            data: { items: { id: string; username: string; actions?: unknown }[] };
        }
    ).data;

    return {
        status: response.status,
        ...Object.fromEntries(items.map((item) => [item.username, item.actions])),
        self: items.find((item) => item.id === user.id)?.actions
    };
};

/**
 * `actions` is what the caller may do to each account: the route's key AND the rank rule, so a
 * client renders a ban button only where the ban would be accepted. One column per role, one row
 * per account level.
 */
describe('GET /users — what the caller may do to each account', () => {
    it('lets a moderator edit, ban and erase a customer, and nothing on staff or an admin', async () => {
        const seen = await actionsSeenBy('moderator');

        expect(seen).toMatchObject({
            status: 200,
            'row-customer': { update: true, ban: true, delete: true },
            'row-support': { update: false, ban: false, delete: false },
            'row-admin': { update: false, ban: false, delete: false }
        });
    });

    it('lets an admin act on a customer and on staff, but not on another admin — and on themself', async () => {
        const seen = await actionsSeenBy('admin');

        expect(seen).toMatchObject({
            'row-customer': { update: true, ban: true, delete: true },
            'row-support': { update: true, ban: true, delete: true },
            'row-admin': { update: false, ban: false, delete: false },
            self: { update: true, ban: true, delete: true }
        });
    });

    // `ban` is its own key: support may correct a profile and may not lock someone out.
    it('gives support the edit but not the ban, and no erase', async () => {
        const seen = await actionsSeenBy('support');

        expect(seen).toMatchObject({
            'row-customer': { update: true, ban: false, delete: false },
            'row-support': { update: false, ban: false, delete: false }
        });
    });

    it('carries the same answer on the single read and on a write’s response', async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const customer = await createUser(
            { email: 'single@row.test', username: 'row-single' },
            'customer'
        );

        const read = await api().get(`/users/${customer.id}`).set('Authorization', bearer);
        const edit = await api()
            .patch(`/users/${customer.id}`)
            .set('Authorization', bearer)
            .send({ username: 'row-edited' });

        expect(read.body.data.actions).toEqual({ update: true, ban: true, delete: true });
        expect(edit.body.data.actions).toEqual({ update: true, ban: true, delete: true });
    });

    it('is absent from the account’s own record, which has no one to rank', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.body.data).not.toHaveProperty('actions');
    });
});
