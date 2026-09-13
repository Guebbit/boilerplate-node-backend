/**
 * @module
 * Pins the feedback module's audit vocabulary (`src/modules/feedback/audit.ts`). The action
 * STRINGS are a wire contract read by external log queries and alerts, so a rename here
 * type-checks cleanly but can silently stop an alert firing — the cross-cutting suite only proves
 * the shape, the values themselves are asserted by their owner, here.
 */

import { feedbackAuditActions } from '../../audit';

describe('the feedback audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(feedbackAuditActions).toEqual({
            ADMIN_FEEDBACK_VIEWED: 'admin.feedback.viewed',
            ADMIN_FEEDBACK_STATUS_UPDATED: 'admin.feedback.status_updated',
            ADMIN_FEEDBACK_DELETED: 'admin.feedback.deleted'
        });
    });
});
