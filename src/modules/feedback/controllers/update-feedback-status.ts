/**
 * @module
 * Controller for `PATCH /feedback/:id` (merge) — admin triage on a feedback ticket's status and
 * notes, built on the shared `createPatchController` factory. There is no PUT: the body is two
 * fields of a bigger record, so it could never be the whole resource.
 *
 * See: docs/modules/feedback.md
 */

import { createPatchController } from '@infrastructure/surfaces/create-update-controller';
import { UpdateFeedbackRequestStatusBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { feedbackRequestService } from '../service';
import { presentFeedbackRequest } from '../presenter';

/** `PATCH /feedback/:id` — a handler over `updateStatusById`, which audits the change itself. */
export const updateFeedbackStatus = createPatchController({
    versioned: false,
    entity: 'feedbackStatus',
    notFoundKey: 'generic.error-not-found',
    patchSchema: UpdateFeedbackRequestStatusBody,
    update: (id, changes, request) =>
        feedbackRequestService.updateStatusById(id, changes, callerContextOf(request)),
    present: (row) => presentFeedbackRequest(row)
});
