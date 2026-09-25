/**
 * @module
 * Controllers for `PUT /feedback/:id` (replace) and `PATCH /feedback/:id` (merge) — admin triage
 * on a feedback ticket's status/notes, built on the shared `createUpdateController` factory
 * (AUDIT_0924 D17d).
 *
 * `updateStatusById` (service.ts) already audits every successful call
 * (`ADMIN_FEEDBACK_STATUS_UPDATED`) — no `auditAction` passed here, matching DM2 in
 * DECISION_MADE.md.
 */

import { z } from 'zod';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import {
    ReplaceFeedbackRequestStatusBody,
    UpdateFeedbackRequestStatusBody
} from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { feedbackRequestService } from '../service';
import type { FeedbackRequest } from '@types';

/**
 * `adminNotes` gets a length cap not expressed in the OpenAPI schema — `.min(1).nullish()`
 * re-stated explicitly (not `.extend`ed away) so PATCH's `null`-clears contract survives the cap.
 */
const adminNotesWithCap = z.string().min(1).max(5000).nullish();

/** The generated PUT body, plus the same `adminNotes` cap PATCH gets below. */
const replaceFeedbackStatusSchema = ReplaceFeedbackRequestStatusBody.extend({
    adminNotes: adminNotesWithCap
});

/** The generated PATCH body, plus a length cap the contract itself does not express. */
const updateFeedbackStatusSchema = UpdateFeedbackRequestStatusBody.extend({
    adminNotes: adminNotesWithCap
});

export const { replace: replaceFeedbackStatus, patch: updateFeedbackStatus } =
    createUpdateController({
        entity: 'feedback',
        replaceSchema: replaceFeedbackStatusSchema,
        patchSchema: updateFeedbackStatusSchema,
        writableFields: Object.keys(ReplaceFeedbackRequestStatusBody.shape),
        update: (id, changes, request) =>
            feedbackRequestService.updateStatusById(id, changes, callerContextOf(request)),
        present: (row) => row.toJSON() as FeedbackRequest,
        // `findById` throws a CastError on a malformed id before `updateStatusById`'s own
        // `generateReject(404, …)` branch ever runs — same generic key the service already uses.
        notFoundKey: 'generic.error-not-found'
    });
