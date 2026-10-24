/**
 * @module
 * What `ADMIN_FEEDBACK_STATUS_UPDATED` says about an edit: the status by value, the admin notes
 * (free text) by name only.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { testCallerContext } from '@tests/callers';
import { feedbackRequestService } from '@modules/feedback/service';
import { feedbackAuditActions } from '@modules/feedback/audit';
import { FeedbackRequestStatus } from '@types';
import * as auditPort from '@infrastructure/observability/audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('feedbackRequestService.updateStatusById — the audit row', () => {
    it('carries the status move by value and the notes by name', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const feedback = await feedbackRequestService.create({
            name: 'Ada',
            email: 'ada@example.com',
            subject: 'Broken checkout',
            message: 'The cart total is wrong.'
        });

        await feedbackRequestService.updateStatusById(
            String(feedback._id),
            { status: FeedbackRequestStatus.resolved, adminNotes: 'Called her back' },
            testCallerContext
        );

        const row = auditSpy.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry.action === feedbackAuditActions.ADMIN_FEEDBACK_STATUS_UPDATED);
        expect(row?.metadata).toEqual({
            changes: {
                status: { from: FeedbackRequestStatus.new, to: FeedbackRequestStatus.resolved }
            },
            changedFields: ['adminNotes']
        });
    });
});
