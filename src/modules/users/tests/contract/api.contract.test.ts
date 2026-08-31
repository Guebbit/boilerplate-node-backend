/**
 * @module
 * Contract tests for /users and /account — the credential-leak guard. `openapi.yaml`'s `User`
 * schema declares `additionalProperties: false`, so any undeclared field on a user response
 * (password, tokens, a bcrypt hash) fails here, not just the ones we thought to name.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser } from '@modules/users/tests/fixtures';

setupTestDb();

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
});

// Extracts usernames from a paginated /users response body.
const usernames = (response: { body: { data: { items: { username: string }[] } } }) =>
    response.body.data.items.map((user) => user.username);

describe('GET /users — the role filters', () => {
    // `admin` and `verified` were applied by the repository but undeclared in the contract; these
    // are the first tests asserting a caller gets what the schema now promises.
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

    // 409, not 422: the request is well-formed, the address is already taken.
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
 * These four cover password provisioning on admin create: supplied directly, deferred to
 * `sendSetupEmail`, or neither — which must 422 rather than silently create an unreachable account.
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
});
