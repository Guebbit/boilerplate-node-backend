/**
 * Signup answers 201 whether or not the verification mail could be queued: the account works
 * either way. A failure there has nobody to tell but the log, so the log line must say whose
 * mail was lost.
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { eventually } from '@tests/eventually';
import { logger } from '@infrastructure/adapters/logger';
import { PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { accountService } from '../../services';

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `logger.error` payloads that report the lost verification mail. */
const lostMailLines = (spy: jest.SpiedFunction<typeof logger.error>): unknown[] =>
    spy.mock.calls
        .map(([line]) => line as unknown)
        .filter(
            (line) =>
                typeof line === 'object' &&
                line !== null &&
                'message' in line &&
                line.message === 'Signup verification email could not be queued.'
        );

describe('POST /account/signup when the verification mail cannot be queued', () => {
    it('still answers 201, and logs the lost mail once with the new account id', async () => {
        const queueFailure = new Error('token store down');
        jest.spyOn(accountService, 'sendVerificationEmail').mockRejectedValue(queueFailure);
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const email = 'mailless@example.com';

        const response = await api().post('/account/signup').send({
            email,
            username: 'mailless',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });
        // The mail is fire-and-forget: give the rejection a moment to reach the handler.
        await eventually(() => lostMailLines(logged).length > 0);

        expect(response.status).toBe(201);
        const created = await userRepository.findOne({ email });
        // Other `error` lines (rate-limit set-up warnings) share the spy; only ours counts.
        expect(lostMailLines(logged)).toStrictEqual([
            {
                message: 'Signup verification email could not be queued.',
                userId: created?.id,
                error: queueFailure
            }
        ]);
    });
});
