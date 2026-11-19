/**
 * `src/infrastructure/adapters/job-kinds.ts`: which worker role takes which channel.
 *
 * The split is the behaviour: a mail must never queue behind an image decode, and a decode must
 * never run in the process sized for mail.
 */
import { WORKER_CHANNELS } from '@types';
import { JOB_KIND_BY_CHANNEL, isServedBy } from '@infrastructure/adapters/job-kinds';

describe('isServedBy', () => {
    it.each(Object.values(WORKER_CHANNELS))('serves %s from exactly one role', (channel) => {
        const roles = (['standard', 'heavy'] as const).filter((role) => isServedBy(role, channel));

        expect(roles).toHaveLength(1);
    });

    it.each([WORKER_CHANNELS.IMAGE_DIGEST, WORKER_CHANNELS.ACCOUNT_EXPORT])(
        'leaves %s to the heavy worker',
        (channel) => {
            expect(isServedBy('heavy', channel)).toBe(true);
            expect(isServedBy('standard', channel)).toBe(false);
        }
    );

    it.each([
        WORKER_CHANNELS.EMAIL_SEND,
        WORKER_CHANNELS.EMAIL_URGENT,
        WORKER_CHANNELS.WEBHOOK_DELIVER
    ])('leaves %s to the standard worker', (channel) => {
        expect(isServedBy('standard', channel)).toBe(true);
        expect(isServedBy('heavy', channel)).toBe(false);
    });

    it('serves a channel no kind is declared for from nobody', () => {
        expect(isServedBy('standard', 'worker.unknown')).toBe(false);
        expect(isServedBy('heavy', 'worker.unknown')).toBe(false);
    });

    it('keeps the urgent mail channel the same kind as ordinary mail, so one role takes both', () => {
        expect(JOB_KIND_BY_CHANNEL[WORKER_CHANNELS.EMAIL_URGENT]).toBe(
            JOB_KIND_BY_CHANNEL[WORKER_CHANNELS.EMAIL_SEND]
        );
    });
});
