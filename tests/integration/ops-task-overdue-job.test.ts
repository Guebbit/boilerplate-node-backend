/**
 * @module
 * The overdue-task sweep driven the way `npm run job` drives it: nothing registered by the
 * test, only what `prepareJob` installs from the job's own `needs`. A sweep whose declaration
 * forgets `subscriptions` stamps its tasks and tells nobody.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { tasksJobs } from '@modules/tasks/jobs';
import { backdateDue, createRefundTask } from '@modules/tasks/tests/factories';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { prepareJob } from '../../scripts/ops/prepare-job';

setupTestDb();

// Reset the listeners so only the runner's own preparation can wire them.
beforeEach(() => resetDomainEvents());

afterEach(() => resetDomainEvents());

describe('the overdue sweep run through the job runner', () => {
    it('tells the staff who work the task', async () => {
        const [job] = tasksJobs;
        const admin = await createUser(
            { email: 'admin@example.com', username: 'admin', authenticatorEnabledAt: new Date() },
            'admin'
        );
        const task = await createRefundTask();
        await backdateDue(String(task._id), 2);

        await prepareJob(job);
        await job.run();

        const { items } = await notificationsService.listVisible(
            callerInScope(
                { ...asRole('admin', admin.id), tenantId: DEPLOYMENT_TENANT_ID },
                'tenant'
            )
        );
        expect(items.map((item) => item.code)).toContain('notifications.staff.task-overdue');
    });
});
