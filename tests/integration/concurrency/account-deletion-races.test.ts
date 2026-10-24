/**
 * Concurrency: a scheduled self-deletion at the edge of its grace.
 *
 * The purge claims a row with `purgeAt <= now` as the first write of its erase transaction; a
 * restore matches only `purgeAt > now`. With one clock the two can never both match. The worst
 * case is two app nodes whose clocks disagree: the restore's node still sees the grace running
 * while the purge's node sees it over. The row must then go to exactly one of them: erased and
 * not restored, or restored and not erased, never both and never an error.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { systemCallerContext } from '@kernel/permissions';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { RACE_SIZE } from '@tests/race';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules();
});

afterEach(() => resetDomainEvents());

/** One account whose `purgeAt` sits between the two nodes' clocks. */
const onTheEdge = (index: number) => {
    const purgeAt = new Date(Date.now() - 1000);
    return createUser({
        email: `edge-${String(index)}@example.com`,
        deletedAt: new Date(Date.now() - 86_400_000),
        deletedBy: 'owner',
        purgeAt
    }).then((user) => ({ user, purgeAt }));
};

describe('restore against the purge at the boundary', () => {
    it('gives each account to exactly one of them', async () => {
        const rounds = await Promise.all(
            Array.from({ length: RACE_SIZE }, (_, index) => onTheEdge(index))
        );

        const outcomes = await Promise.all(
            rounds.map(({ user, purgeAt }) =>
                Promise.allSettled([
                    userService.eraseScheduledDeletion(
                        user,
                        systemCallerContext('User'),
                        new Date()
                    ),
                    // A node whose clock is a second behind still sees the grace running.
                    userService.restoreOwnAccount(user, new Date(purgeAt.getTime() - 1))
                ])
            )
        );

        for (const [index, [erased, restored]] of outcomes.entries()) {
            expect(erased.status).toBe('fulfilled');
            expect(restored.status).toBe('fulfilled');
            const erasedOk = erased.status === 'fulfilled' && erased.value.success;
            const restoredOk = restored.status === 'fulfilled' && restored.value;
            const stored = await userRepository.findById(rounds[index].user.id);

            expect(erasedOk !== restoredOk).toBe(true);
            expect(stored === null).toBe(erasedOk);
        }
    });
});
