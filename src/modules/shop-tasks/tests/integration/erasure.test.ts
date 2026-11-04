/**
 * @module
 * Erasing a person keeps the shop's to-dos about their orders: the record outlives the account,
 * so only the pointer to the person is removed.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withTransaction } from '@infrastructure/runtime/database';
import { taskService } from '@modules/tasks';
import { createSystemTaskAbout, findAllTasks } from '@modules/tasks/tests/factories';
import { TaskLinkType } from '@types';

setupTestDb();

/** The account being erased. */
const ACCOUNT_ID = '65dc8a99604c307b702b5ccc';

describe('erasing the person a shop to-do is about', () => {
    it('keeps a task about an order and detaches the person from it', async () => {
        const about = await createSystemTaskAbout(
            { type: TaskLinkType.order, id: 'order-1' },
            ACCOUNT_ID
        );

        await withTransaction((session) =>
            taskService.eraseOwnTasks(
                { userId: ACCOUNT_ID, email: 'victim@example.com', emailVerified: true },
                session
            )
        );

        const stored = await findAllTasks();
        const kept = stored.find((task) => String(task._id) === String(about._id));
        expect(kept?.subjectId).toBeUndefined();
    });
});
