/**
 * Contract tests for /users and /account — the credential-leak guard.
 *
 * `GET /users` once returned `password` and `tokens`. That was fixed, and
 * `tests/unit/models/users.test.ts` guards it by asserting those two field names are absent.
 * This suite guards the *class* instead: `openapi.yaml`'s `User` schema declares
 * `additionalProperties: false`, so **any** undeclared field on a user response fails here —
 * including one nobody thought to write a name-based assertion for.
 *
 * The explicit credential assertions below are kept as a readable statement of intent; the
 * contract check is what makes them general.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser } from '@modules/users/tests/factory';

setupTestDb();

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
});

const usernames = (response: { body: { data: { items: { username: string }[] } } }) =>
    response.body.data.items.map((user) => user.username);

describe('GET /users — the role filters', () => {
    /*
     * `admin` and `verified` were applied by the repository and named nowhere in the contract, so
     * a generated client had no way to know they worked. Declared now, which makes these the first
     * tests that a caller sending them gets what the schema promises.
     *
     * One case per value rather than a count, so a failure names which rule moved.
     */
    it('narrows to admins, and to the unverified', async () => {
        // Asserted by membership, not by an exact list: the authenticated admin is a fixture this
        // test does not own, and pinning the whole page would break on any change to it.
        const { bearer } = await authenticateAs('admin');
        await createUser({ username: 'plain-verified', email: 'pv@example.com', verified: true });
        await createUser({
            username: 'plain-unverified',
            email: 'pu@example.com',
            verified: false
        });

        const admins = await api().get('/users?admin=true').set('Authorization', bearer);
        expect(admins.status).toBe(200);
        expect(usernames(admins)).not.toContain('plain-verified');
        expect(usernames(admins)).not.toContain('plain-unverified');

        const unverified = await api().get('/users?verified=false').set('Authorization', bearer);
        expect(unverified.status).toBe(200);
        expect(usernames(unverified)).toContain('plain-unverified');
        expect(usernames(unverified)).not.toContain('plain-verified');
    });
});

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

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/account');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/signup', () => {
    it('matches the contract for a new account and exposes no credentials', async () => {
        const response = await api().post('/account/signup').send({
            username: 'newcomer',
            email: 'newcomer@example.com',
            password: 'password123',
            passwordConfirm: 'password123'
        });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
        assertNoCredentials(response.body);
    });

    // 409, not 422: the request is well-formed, the address is taken. The implementation has
    // always answered 409 here; the spec did not declare it until this test was written.
    it('matches the error contract for an email that is already registered', async () => {
        const payload = {
            username: 'duplicate',
            email: 'duplicate@example.com',
            password: 'password123',
            passwordConfirm: 'password123'
        };
        await api().post('/account/signup').send(payload);
        const response = await api().post('/account/signup').send(payload);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });
});

/**
 * `password` used to be required on every admin create — see `write-users.ts`'s docblock and
 * `HANDOFF.md` §2.22. These four cover the shape that replaced it: a password may be supplied
 * directly, deferred to `sendSetupEmail`, or — the one combination that leaves an account nobody
 * can ever reach — neither, which is a 422 rather than a silent create.
 */
describe('POST /users', () => {
    it('creates a user with a password supplied directly, and exposes no credentials', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'admin-created@example.com',
            username: 'admincreated',
            password: 'Password1!'
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
});

describe('PUT /users/{id}', () => {
    // The bug this guards: the controller called `validateData` with no second argument, so
    // `requirePassword` defaulted to `true` on the update branch too, and an admin could not edit
    // a user without also resubmitting that user's password. `email` and `username` are still sent
    // — `validateData` runs the same schema an admin create does, which requires both regardless of
    // `requirePassword`, and a form re-submitting its own fields is the realistic shape of an edit.
    // Password is the one field this case deliberately leaves out.
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
});
