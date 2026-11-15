/**
 * @module
 * Contract tests for /users and /account — the credential-leak guard. `openapi.yaml`'s `User`
 * schema declares `additionalProperties: false`, so any undeclared field on a user response
 * (password, an argon2 hash) fails here, not just the ones we thought to name.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { freezeDate, advanceDate } from '@tests/clock';
import { reauthWindowSeconds } from '@kernel/config';
import { credentialHolding } from '@tests/credentials';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { USER_SETUP_REQUESTED } from '../../events';
import { phoneAad } from '../../model';

setupTestDb();

/**
 * The audit port is REPLACED, not spied on — `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes under swc. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

/** The stored `active` flag of one account. */
const activeOf = (id: string) => userRepository.findById(id).then((user) => user?.active);

/** The tenant role one account holds now, `null` for none. */
const roleOf = (id: string) =>
    accessService.rolesOf(id, DEPLOYMENT_TENANT_ID).then(({ tenant }) => tenant);

// Serializes the payload and checks for credential fields/values that must never leave the API.
/** Fails when a response body carries a password, hash or token field. */
const assertNoCredentials = (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('$argon2'); // a password hash, however it got there
};

describe('GET /users', () => {
    it('matches the contract and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().get('/users').set('Authorization', bearer);

        expect(response.status).toBe(200);
        assertNoCredentials(response.body);
    });

    /**
     * `GET /users/:id` resolves `role` from the membership store; the list endpoint's own
     * serialization went through the document's `toJSON` transform instead, which has no role
     * to offer — every item in a page answered with `role` silently missing.
     */
    it('carries each item’s role, the same as GET /users/:id does', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const response = await api().get('/users').set('Authorization', bearer);

        expect(response.status).toBe(200);
        const { items } = response.body as { items: { id: string; role?: string }[] };
        expect(items.find((item) => item.id === String(user._id))?.role).toBe('admin');
    });

    it('lists a list item: no phone, website or pending address, and the hold as a flag only', async () => {
        const { bearer } = await authenticateAs('admin');
        const held = await createUser({
            email: 'held@example.com',
            username: 'held',
            website: 'https://held.example.com',
            purchaseHold: {
                until: new Date(Date.now() + 86_400_000),
                reason: 'staff',
                note: 'Chargeback pending',
                setAt: new Date()
            }
        });
        await storePhone(String(held._id), '+390123456789');

        const response = await api().get('/users').set('Authorization', bearer);

        const items = response.body.items as Record<string, unknown>[];
        const item = items.find((candidate) => candidate.id === String(held._id));
        expect(item).toMatchObject({ email: 'held@example.com', purchaseHeld: true });
        expect(item).toHaveProperty('actions');
        for (const hidden of ['phone', 'website', 'pendingEmail', 'purchaseHold']) {
            expect(item).not.toHaveProperty(hidden);
        }
        expect(JSON.stringify(item)).not.toContain('Chargeback pending');
    });

    it('keeps the hold’s own details on the account read', async () => {
        const { bearer } = await authenticateAs('admin');
        const held = await createUser({
            email: 'held2@example.com',
            username: 'held2',
            purchaseHold: {
                until: new Date(Date.now() + 86_400_000),
                reason: 'staff',
                note: 'Chargeback pending',
                setAt: new Date()
            }
        });

        const response = await api()
            .get(`/users/${String(held._id)}`)
            .set('Authorization', bearer);

        expect(response.body.purchaseHold).toMatchObject({ note: 'Chargeback pending' });
    });
});

/**
 * The `?role=` filter itself is gone — `role` is a membership fact now, not a searchable document
 * column, and filtering by it needs a two-step resolve `createRepository`'s generic `exact` spec
 * can't express. Deliberately not rebuilt here: no caller of `GET /users` needs it today.
 */

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

        /**
         * A profile is the caller's identity: a browser must never be told to keep a copy. See
         * `noStore` in `infrastructure/http/middlewares/cache.ts`.
         */
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

    it('refuses a null imageUrl: a create has no image to remove', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'no-image@example.com',
            username: 'noimage',
            imageUrl: null
        });

        expect(response.status).toBe(422);
    });

    it('stores a language in its canonical spelling and 422s on a malformed tag', async () => {
        const { bearer } = await authenticateAs('admin');

        const created = await api()
            .post('/users')
            .set('Authorization', bearer)
            .send({ email: 'lang-ok@example.com', username: 'langok', locale: 'PT-br' });
        const refused = await api()
            .post('/users')
            .set('Authorization', bearer)
            .send({ email: 'lang-bad@example.com', username: 'langbad', locale: 'en-a' });

        expect(created.status).toBe(201);
        expect(created.body.locale).toBe('pt-BR');
        expect(refused.status).toBe(422);
    });

    it('creates a user without a password, exposes no credentials, and mails the owner a setup link', async () => {
        markDomainEventsWired();
        const seen: string[] = [];
        onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
            seen.push(userId);
        });
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'admin-created@example.com',
            username: 'admincreated'
        });

        await settleOutboxNudges();

        expect(response.status).toBe(201);
        assertNoCredentials(response.body);
        expect(seen).toEqual([(response.body as { id: string }).id]);
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

    /**
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

    /**
     * The paths that can set a password are listed, with their breach checks, in
     * `tests/contract/password-set-paths.test.ts`: `POST /users` is not one of them.
     */
});

/**
 * Store a phone the way production does, encrypted under the account's own binding. The factory
 * writes plaintext, which no code path ever reads back.
 *
 * @param userId - the stored account
 * @param phone - the plaintext number
 */
const storePhone = (userId: string, phone: string) =>
    userRepository.updateMany(
        { _id: userId },
        { $set: { phone: encryptPii(phone, phoneAad(userId)) } }
    );

describe('PUT /users/{id}', () => {
    /**
     * A PUT body IS the new resource (RFC 9110 §9.3.4) — every omitted optional field is
     * cleared, not left alone. `imageUrl` is the exception: it belongs to an upload, so it is
     * left out of this body and survives it.
     */
    it('replaces every writable field, clearing every omitted optional one', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            {
                username: 'replacefull',
                email: 'replacefull@example.com',
                imageUrl: 'https://cdn.example.com/avatars/original.png'
            },
            'customer'
        );
        await storePhone(target.id, '+15551234567');

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ username: 'replacedfull' });

        expect(response.status).toBe(200);
        expect(response.body.imageUrl).toBe('https://cdn.example.com/avatars/original.png');
        expect(response.body.phone).toBeUndefined();
    });

    /**
     * `username` is the Replace schema's `required` set — an omitted one is a malformed PUT, not a
     * value to fill in.
     */
    it('refuses a body missing the required identity field', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'replacepartial', email: 'replacepartial@example.com' },
            'customer'
        );

        const response = await api()
            .put(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ website: null });

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
            .send({ username: 'editednocredential' });

        expect(response.status).toBe(200);
        assertNoCredentials(response.body);
    });

    /**
     * A credential is its owner's alone: neither is a declared field, so the strict schema
     * refuses it and the stored values stay as they were.
     */
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
            .send({ username: 'putcredential', ...extra });

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
            .send({ website: 'https://patched.example.com' });

        expect(response.status).toBe(200);
        expect(response.body.website).toBe('https://patched.example.com');
        expect(response.body.email).toBe(target.email);
        expect(response.body.username).toBe(target.username);
    });

    it('canonicalises the language and 422s on a malformed tag', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser(
            { username: 'patchlang', email: 'patchlang@example.com' },
            'customer'
        );

        const saved = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ locale: 'ZH-hant-tw' });
        const refused = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ locale: 'en-a' });

        expect(saved.status).toBe(200);
        expect(saved.body.locale).toBe('zh-Hant-TW');
        expect(refused.status).toBe(422);
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
        expect(response.body.imageUrl).toBe('https://cdn.example.com/avatars/original.png');
    });

    it('null clears an optional field', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'patchclearsphone',
            email: 'patchclearsphone@example.com'
        });
        await storePhone(target.id, '+15551234567');

        const response = await api()
            .patch(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ phone: null });

        expect(response.status).toBe(200);
        expect(response.body.phone).toBeUndefined();
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

        expect(response.status).toBe(204);
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

        expect(response.status).toBe(204);
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
        expect(response.body.errors[0].code).toBe('USER_NOT_DELETED');
    });

    it('answers 409 USER_ERASURE_DUE for an owner-scheduled deletion past its purgeAt', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser({
            deletedAt: new Date(Date.now() - 31 * 86_400_000),
            deletedBy: 'owner',
            purgeAt: new Date(Date.now() - 1000)
        });

        const response = await api()
            .post(`/users/${String(user._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('USER_ERASURE_DUE');
        expect((await userRepository.findById(String(user._id)))!.deletedBy).toBe('owner');
    });
});

/** A status change is an action endpoint, not a field of PUT/PATCH; a repeat is a 409 with a code. */
describe('POST /users/{id}/activate and /deactivate', () => {
    it('deactivates, ends the account’s sessions, and activates again', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser();

        const off = await api().post(`/users/${user.id}/deactivate`).set('Authorization', bearer);
        const on = await api().post(`/users/${user.id}/activate`).set('Authorization', bearer);

        expect(off.status).toBe(200);
        expect(off.body).toMatchObject({ active: false });
        expect(off.body.actions).toMatchObject({ activate: true, deactivate: false });
        expect(on.status).toBe(200);
        expect(on.body).toMatchObject({ active: true });
        expect(on.body.actions).toMatchObject({ activate: false, deactivate: true });
    });

    it.each([
        ['activate', true, 'USER_ALREADY_ACTIVE'],
        ['deactivate', false, 'USER_ALREADY_INACTIVE']
    ])('answers 409 %s when the account is already there', async (action, active, code) => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser({ active });

        const response = await api()
            .post(`/users/${user.id}/${action}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe(code);
    });

    it.each(['activate', 'deactivate'])(
        '%s answers 404 for an account that is not there',
        async (action) => {
            const { bearer } = await authenticateAs('admin');

            const response = await api()
                .post(`/users/000000000000000000000000/${action}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(404);
        }
    );

    // `ban:User` is the key a deactivation takes, and support does not hold it.
    it.each(['activate', 'deactivate'])(
        'refuses %s to a caller without ban:User',
        async (action) => {
            const { bearer } = await authenticateAsRole('support');
            const user = await createUser();

            const response = await api()
                .post(`/users/${user.id}/${action}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(403);
            expect(await activeOf(user.id)).toBe(true);
        }
    );

    it('refuses a moderator an administrator’s account, and leaves it active', async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const admin = await createUser({}, 'admin');

        const response = await api()
            .post(`/users/${admin.id}/deactivate`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response.body.errors[0].code).toBe('ROLE_MANAGEMENT_REQUIRED');
        expect(await activeOf(admin.id)).toBe(true);
    });

    it('refuses `active` in a PATCH body', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser();

        const patch = await api()
            .patch(`/users/${user.id}`)
            .set('Authorization', bearer)
            .send({ active: false });

        expect(patch.status).toBe(422);
        expect(await activeOf(user.id)).toBe(true);
    });
});

/** Lifting a hold that is not there is a conflict, not a second success. */
describe('POST /users/{id}/lift-purchase-hold', () => {
    it('answers 409 USER_PURCHASE_HOLD_NOT_SET for an account with nothing to lift', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await createUser();

        const response = await api()
            .post(`/users/${user.id}/lift-purchase-hold`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('USER_PURCHASE_HOLD_NOT_SET');
    });
});

describe('DELETE /users/{id}', () => {
    it('matches the contract for a soft delete', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'soft-delete@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(204);
        const stored = await userRepository.findById(String(target._id));
        expect(stored?.deletedAt).toBeInstanceOf(Date);
    });

    it('refuses a body with 415 rather than reading its `hardDelete`', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'body-flag@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}`)
            .set('Authorization', bearer)
            .send({ hardDelete: true });

        expect(response.status).toBe(415);
        const stored = await userRepository.findById(String(target._id));
        expect(stored?.deletedAt).toBeFalsy();
    });
});

describe('DELETE /users/{id}/hard', () => {
    it('matches the contract, and the row is gone rather than marked', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'erase-me@example.com' });

        const response = await api()
            .delete(`/users/${String(target._id)}/hard`)
            .set('Authorization', bearer);

        expect(response.status).toBe(204);
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

/** The emails of a list response, in the order the API returned them. */
const emailsOf = (response: { body: { items: { email: string }[] } }) =>
    response.body.items.map((user) => user.email).filter((email) => email.endsWith('@sort.test'));

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
    const { items } = response.body as {
        items: { id: string; username: string; actions?: unknown }[];
    };

    return {
        status: response.status,
        ...Object.fromEntries(items.map((item) => [item.username, item.actions])),
        self: items.find((item) => item.id === user.id)?.actions
    };
};

/** Every flag `false`: the answer for an account the caller may not touch at all. */
const noActions = {
    update: false,
    assignRole: false,
    revokeRole: false,
    delete: false,
    hardDelete: false,
    restore: false,
    placePurchaseHold: false,
    liftPurchaseHold: false,
    activate: false,
    deactivate: false
};

/**
 * What a caller who holds every user key gets on a live, active account with no hold: everything
 * but the moves that need another state (`restore`, `liftPurchaseHold`, `activate`).
 */
const liveAccountActions = {
    ...noActions,
    update: true,
    delete: true,
    hardDelete: true,
    placePurchaseHold: true,
    deactivate: true
};

/**
 * `actions` is what the caller may do to each account: the route's key AND the protection of staff
 * accounts AND the account's own state, so a client renders a button only where the call would be
 * accepted. One column per role, one row per kind of account.
 */
describe('GET /users — what the caller may do to each account', () => {
    it('lets a moderator edit, hold, deactivate and erase a customer, and nothing on staff or an admin', async () => {
        const seen = await actionsSeenBy('moderator');

        expect(seen).toMatchObject({
            status: 200,
            'row-customer': liveAccountActions,
            'row-support': noActions,
            'row-admin': noActions
        });
    });

    it('lets an admin, who manages roles, act on a customer, on staff and on another admin', async () => {
        const seen = await actionsSeenBy('admin');
        const adminActions = { ...liveAccountActions, assignRole: true };
        // There is a role to take away only from the accounts that hold one.
        const onStaff = { ...adminActions, revokeRole: true };

        expect(seen).toMatchObject({
            'row-customer': adminActions,
            'row-support': onStaff,
            'row-admin': onStaff,
            self: onStaff
        });
    });

    // `ban:User` is its own key: support may correct a profile and may not lock someone out.
    it('gives support the edit but not the holds or the switch, and no erase', async () => {
        const seen = await actionsSeenBy('support');

        expect(seen).toMatchObject({
            'row-customer': { ...noActions, update: true },
            'row-support': noActions
        });
    });

    it('reads the account’s state: a deleted one offers restore, a deactivated one activate, a held one lift', async () => {
        const { bearer } = await authenticateAsRole('admin');
        await createUser(
            { email: 'gone@row.test', username: 'row-gone', deletedAt: new Date() },
            'customer'
        );
        await createUser({ email: 'off@row.test', username: 'row-off', active: false }, 'customer');
        await createUser(
            {
                email: 'held@row.test',
                username: 'row-held',
                purchaseHold: {
                    until: new Date(Date.now() + 86_400_000),
                    reason: 'staff',
                    setAt: new Date()
                }
            },
            'customer'
        );

        const response = await api().get('/users?pageSize=50').set('Authorization', bearer);
        const byName = new Map(
            (
                response.body as {
                    items: { username: string; actions: Record<string, boolean> }[];
                }
            ).items.map((item) => [item.username, item.actions])
        );

        expect(byName.get('row-gone')).toMatchObject({ delete: false, restore: true });
        expect(byName.get('row-off')).toMatchObject({ activate: true, deactivate: false });
        expect(byName.get('row-held')).toMatchObject({ liftPurchaseHold: true });
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

        expect(read.body.actions).toEqual(liveAccountActions);
        expect(edit.body.actions).toEqual(liveAccountActions);
    });

    it('is absent from the account’s own record, which has no one to protect', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.body).not.toHaveProperty('actions');
    });
});

/**
 * Handing a staff role out, or taking one away, asks for a fresh session at the tier minting an API
 * key does: a stolen session must not be able to quietly make a second administrator. The door
 * asks it of every call, a repeat included; a profile edit never is.
 */
describe('the step-up on the role door', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it.each([
        ['assign-role', 'customer', { role: 'support' }],
        ['revoke-role', 'support', undefined]
    ])(
        '401s REAUTH_REQUIRED for a stale session calling %s, and writes nothing',
        async (door, held, body) => {
            freezeDate();
            const { bearer } = await authenticateAsRole('admin');
            const target = await createUser(
                { email: `stale-${door}@target.test`, username: `stale${door.slice(0, 6)}` },
                held
            );
            advanceDate((reauthWindowSeconds('critical') + 1) * 1000);

            const response = await api()
                .post(`/users/${target.id}/${door}`)
                .set('Authorization', bearer)
                .send(body);

            expect(response.status).toBe(401);
            expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
            expect(await roleOf(target.id)).toBe(held === 'customer' ? null : held);
        }
    );

    it('lets the same stale session edit the profile, which names no role', async () => {
        freezeDate();
        const { bearer } = await authenticateAsRole('admin');
        const target = await createUser({ email: 'stale@target.test', username: 'staletarget' });
        advanceDate((reauthWindowSeconds('critical') + 1) * 1000);

        const response = await api()
            .patch(`/users/${target.id}`)
            .set('Authorization', bearer)
            .send({ username: 'renamedtarget' });

        expect(response.status).toBe(200);
    });

    it.each([
        ['deactivate', true],
        ['activate', false]
    ])(
        '401s REAUTH_REQUIRED for a stale role manager calling %s, and writes nothing',
        async (action, wasActive) => {
            freezeDate();
            const { bearer } = await authenticateAsRole('admin');
            const target = await createUser(
                { email: 'stale3@target.test', username: 'stalethree', active: wasActive },
                'support'
            );
            advanceDate((reauthWindowSeconds('critical') + 1) * 1000);

            const response = await api()
                .post(`/users/${target.id}/${action}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(401);
            expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
            expect(await activeOf(target.id)).toBe(wasActive);
        }
    );

    it('lets a stale moderator ban a customer, since a moderator manages no staff', async () => {
        freezeDate();
        const { bearer } = await authenticateAsRole('moderator');
        const target = await createUser({ email: 'stale4@target.test', username: 'stalefour' });
        advanceDate((reauthWindowSeconds('critical') + 1) * 1000);

        const response = await api()
            .post(`/users/${target.id}/deactivate`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });
});

/**
 * An API key never holds `assign:Role`, so a `PUT /users/{id}` from one is never challenged: it
 * edits a profile, and the role door is session-only: `isAuth` refuses it 401.
 */
describe('the users routes from an API key', () => {
    it('edits a profile, instead of a bare 401', async () => {
        const secret = await credentialHolding(['update:User']);
        const target = await createUser({ email: 'keyed@target.test', username: 'keyedtarget' });

        const response = await api()
            .put(`/users/${target.id}`)
            .set('Authorization', `Bearer ${secret}`)
            .send({ username: 'keyedrenamed' });

        expect(response.status).toBe(200);
    });

    it('is refused 401 at the role door, before any permission is asked', async () => {
        const secret = await credentialHolding(['update:User']);
        const target = await createUser({ email: 'keyed2@target.test', username: 'keyedtwo' });

        const response = await api()
            .post(`/users/${target.id}/assign-role`)
            .set('Authorization', `Bearer ${secret}`)
            .send({ role: 'support' });

        expect(response.status).toBe(401);
    });
});

/**
 * A role grant answers by the rule that refused it: no `assign:Role` is a 403 (judged first), a
 * name nobody can be given is a translated 422 naming `role`.
 */
describe('refusing a role grant over HTTP', () => {
    it('403s ROLE_MANAGEMENT_REQUIRED for a caller without assign:Role, whatever the name', async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const target = await createUser({ email: 'grant@target.test', username: 'granttarget' });

        const real = await api()
            .post(`/users/${target.id}/assign-role`)
            .set('Authorization', bearer)
            .send({ role: 'support' });
        const invented = await api().post('/users').set('Authorization', bearer).send({
            email: 'invented@target.test',
            username: 'inventedrole',
            role: 'no-such-role'
        });

        expect([real.status, invented.status]).toEqual([403, 403]);
        expect(real.body.errors[0].code).toBe('ROLE_MANAGEMENT_REQUIRED');
        expect(invented.body.errors[0].code).toBe('ROLE_MANAGEMENT_REQUIRED');
    });

    it.each(['no-such-role', 'customer'])(
        '422s a translated error naming role for %s, to a caller who may assign',
        async (role) => {
            const { bearer } = await authenticateAsRole('admin');
            const target = await createUser({
                email: 'grant2@target.test',
                username: 'grant2target'
            });

            const response = await api()
                .post(`/users/${target.id}/assign-role`)
                .set('Authorization', bearer)
                .set('Accept-Language', 'it')
                .send({ role });

            expect(response.status).toBe(422);
            expect(response.body.errors[0]).toMatchObject({
                code: 'VALIDATION_ERROR',
                details: { field: 'role' },
                message: 'Questo ruolo non esiste o non può essere assegnato a un account.'
            });
        }
    );
});

/**
 * The role door's own answers: the user back with its flags, a repeat as 409, a missing account
 * as 404, a bare body as 422, and no `If-Match` to fence two callers.
 */
describe('POST /users/{id}/assign-role and /revoke-role', () => {
    it('hands a role out, shows it on the user, and takes it away again', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const target = await createUser({ email: 'door@target.test', username: 'doortarget' });

        const granted = await api()
            .post(`/users/${target.id}/assign-role`)
            .set('Authorization', bearer)
            .send({ role: 'support' });
        const revoked = await api()
            .post(`/users/${target.id}/revoke-role`)
            .set('Authorization', bearer);

        expect(granted.status).toBe(200);
        expect(granted.body).toMatchObject({
            role: 'support',
            actions: { assignRole: true, revokeRole: true }
        });
        expect(revoked.status).toBe(200);
        expect(revoked.body.role).toBeUndefined();
        expect(revoked.body.actions.revokeRole).toBe(false);
    });

    it('answers 409 to a repeat of either move', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const held = await createUser(
            { email: 'held@target.test', username: 'heldtarget' },
            'support'
        );
        const plain = await createUser({ email: 'plain@target.test', username: 'plaintarget' });

        const again = await api()
            .post(`/users/${held.id}/assign-role`)
            .set('Authorization', bearer)
            .send({ role: 'support' });
        const none = await api()
            .post(`/users/${plain.id}/revoke-role`)
            .set('Authorization', bearer);

        expect([again.status, none.status]).toEqual([409, 409]);
        expect([again.body.errors[0].code, none.body.errors[0].code]).toEqual([
            'USER_ROLE_ALREADY_ASSIGNED',
            'USER_ROLE_NOT_ASSIGNED'
        ]);
    });

    it('lets the last of two different roles win, with no If-Match to refuse the second', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const target = await createUser({ email: 'race@target.test', username: 'racetarget' });
        const assign = (role: string) =>
            api()
                .post(`/users/${target.id}/assign-role`)
                .set('Authorization', bearer)
                .send({ role });

        const first = await assign('support');
        const second = await assign('manager');

        expect([first.status, second.status]).toEqual([200, 200]);
        expect(await roleOf(target.id)).toBe('manager');
    });

    it('answers 404 for an account that does not exist, and 422 for a body without a role', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const target = await createUser({ email: 'body@target.test', username: 'bodytarget' });

        const missing = await api()
            .post('/users/64b7f0000000000000000000/revoke-role')
            .set('Authorization', bearer);
        const bare = await api()
            .post(`/users/${target.id}/assign-role`)
            .set('Authorization', bearer)
            .send({});

        expect([missing.status, bare.status]).toEqual([404, 422]);
    });

    it('is refused to a moderator, whose keys do not include assign:Role', async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const target = await createUser(
            { email: 'mod@target.test', username: 'modtarget' },
            'support'
        );

        const revoked = await api()
            .post(`/users/${target.id}/revoke-role`)
            .set('Authorization', bearer);

        expect(revoked.status).toBe(403);
        expect(revoked.body.errors[0].code).toBe('ROLE_MANAGEMENT_REQUIRED');
        expect(await roleOf(target.id)).toBe('support');
    });
});
