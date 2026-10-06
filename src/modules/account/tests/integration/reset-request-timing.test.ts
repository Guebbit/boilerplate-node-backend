/**
 * @module
 * `POST /account/reset` answers at once, whatever the lookup behind it costs: a response that
 * waited for a token write and a mail enqueue only a registered address has would tell a stranger
 * which addresses those are. A failure behind it is logged, since nothing else will show it.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { eventually } from '@tests/eventually';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';

/** Every mail the app queued. */
const mockOutbox: { template: string }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn((_envelope: unknown, template: string) => {
        mockOutbox.push({ template });
        return Promise.resolve();
    })
}));

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

afterEach(() => jest.restoreAllMocks());

describe('POST /account/reset timing', () => {
    it('answers before a slow repository does, and still mails once it finishes', async () => {
        const user = await createUser({ email: 'slow@example.com' });
        const lookup = userService.findByEmail.bind(userService);
        let released = false;
        jest.spyOn(userService, 'findByEmail').mockImplementation(
            (address) =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        released = true;
                        resolve(lookup(address));
                    }, 600);
                })
        );

        const response = await api().post('/account/reset').send({ email: user.email });

        expect(response.status).toBe(200);
        // The repository is still thinking: the answer did not wait for it.
        expect(released).toBe(false);
        await eventually(() =>
            mockOutbox.some(({ template }) => template === 'account.reset-request')
        );
        expect(mockOutbox.map(({ template }) => template)).toContain('account.reset-request');
    });

    it('answers an unknown address in the same breath, behind a slow repository too', async () => {
        let released = false;
        jest.spyOn(userService, 'findByEmail').mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        released = true;
                        resolve(undefined);
                    }, 600);
                })
        );

        const response = await api().post('/account/reset').send({ email: 'nobody@example.com' });

        expect(response.status).toBe(200);
        expect(released).toBe(false);
    });

    it('logs a failure behind the answer instead of swallowing it, and still answers 200', async () => {
        jest.spyOn(userService, 'findByEmail').mockRejectedValue(new Error('database is gone'));
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        const response = await api().post('/account/reset').send({ email: 'anyone@example.com' });
        await eventually(() => logged.mock.calls.length > 0);

        expect(response.status).toBe(200);
        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'A password reset request failed.' })
        );
    });
});
