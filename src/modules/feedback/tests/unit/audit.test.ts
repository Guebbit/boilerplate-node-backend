/**
 * @module
 * Pins the feedback module's audit vocabulary (`src/modules/feedback/audit.ts`). The action
 * STRINGS are a wire contract read by external log queries and alerts, so a rename here
 * type-checks cleanly but can silently stop an alert firing — the cross-cutting suite only proves
 * the shape, the values themselves are asserted by their owner, here.
 */

import type { AuditAction } from '@infrastructure/observability/audit';
import { feedbackAuditActions } from '../../audit';

describe('the feedback audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(feedbackAuditActions).toEqual({
            ADMIN_FEEDBACK_VIEWED: 'admin.feedback.viewed',
            ADMIN_FEEDBACK_STATUS_UPDATED: 'admin.feedback.status_updated',
            ADMIN_FEEDBACK_DELETED: 'admin.feedback.deleted'
        });
    });

    /*
     * The `declare module` augmentation in `audit.ts` is what puts these into `AuditAction`.
     * Drop it and the module still compiles on its own — but `emitAuditEvent` then rejects every
     * action this module owns, at the call sites rather than here. Checked at type-check time:
     * `tsconfig.json` includes the whole `src` tree, so this line is compiled even though jest
     * does not type-check it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = feedbackAuditActions.ADMIN_FEEDBACK_VIEWED;

        expect(action).toBe('admin.feedback.viewed');
    });
});
