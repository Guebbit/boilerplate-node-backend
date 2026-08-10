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
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api, authenticateAs } from '../helpers/http';

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
