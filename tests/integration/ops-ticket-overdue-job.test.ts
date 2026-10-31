/**
 * @module
 * The overdue-ticket sweep driven the way `npm run job` drives it: nothing registered by the
 * test, only what `prepareJob` installs from the job's own `needs`. A sweep whose declaration
 * forgets `subscriptions` stamps its tickets and tells nobody.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { ticketsJobs } from '@modules/tickets/jobs';
import { backdateDue, createRefundTicket } from '@modules/tickets/tests/factories';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { prepareJob } from '../../scripts/ops/prepare-job';

setupTestDb();

// Reset the listeners so only the runner's own preparation can wire them.
beforeEach(() => resetDomainEvents());

afterEach(() => resetDomainEvents());

describe('the overdue sweep run through the job runner', () => {
    it('tells the staff who work the ticket', async () => {
        const [job] = ticketsJobs;
        const admin = await createUser(
            { email: 'admin@example.com', username: 'admin', authenticatorEnabledAt: new Date() },
            'admin'
        );
        const ticket = await createRefundTicket();
        await backdateDue(String(ticket._id), 2);

        await prepareJob(job);
        await job.run();

        const { items } = await notificationsService.listVisible(
            callerInScope(
                { ...asRole('admin', admin.id), tenantId: DEPLOYMENT_TENANT_ID },
                'tenant'
            )
        );
        expect(items.map((item) => item.code)).toContain('notifications.staff.ticket-overdue');
    });
});
