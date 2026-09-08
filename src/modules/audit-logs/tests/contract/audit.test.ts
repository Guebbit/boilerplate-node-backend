/**
 * @module
 * Contract tests for `GET /audit` — the one route this module owns. `authenticateAs` only spells
 * `admin`/`user`, so callers here log in directly as the two roles the endpoint actually
 * distinguishes: a holder of `audit.read` and one who never gets past the guard.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import { auditLogRepository } from '@modules/audit-logs/repository';

setupTestDb();

/**
 * Create a user in the given preset role and log them in through the real `POST /account/login`
 * route — same flow as `authenticateAs`, for a role that helper does not spell.
 */
const authenticateInRole = async (role: string) => {
    const user = await createUser({ role, verified: true });
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return { user, bearer: `Bearer ${String(response.body?.data?.token)}` as const };
};

describe('GET /audit', () => {
    it('401s an unauthenticated request', async () => {
        const response = await api().get('/audit');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('403s a role that holds no audit.read, an editor included', async () => {
        const { bearer } = await authenticateInRole('editor');

        const response = await api().get('/audit').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a moderator, filtered by actor and target', async () => {
        const { user, bearer } = await authenticateInRole('moderator');
        await auditLogRepository.create({
            actor_user_id: String(user._id),
            actor_role: 'user',
            actor_role_name: 'moderator',
            action: 'admin.user.banned',
            outcome: 'success',
            target_type: 'user',
            target_id: 'target-9',
            timestamp: new Date(),
            level: 'info'
        });

        const response = await api()
            .get(`/audit?actor=${String(user._id)}&target=target-9`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].actor_role_name).toBe('moderator');
        expect(response).toSatisfyApiSpec();
    });

    it('422s a since filter that is not a valid timestamp', async () => {
        const { bearer } = await authenticateInRole('moderator');

        const response = await api().get('/audit?since=not-a-date').set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});
