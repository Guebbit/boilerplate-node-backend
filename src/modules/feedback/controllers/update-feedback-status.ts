/**
 * @module
 * Controllers for `PUT /feedback/:id` (replace) and `PATCH /feedback/:id` (merge) — admin triage
 * on a feedback ticket's status and notes, built on the shared `createUpdateController` factory.
 *
 * See: docs/modules/feedback.md
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import {
    ReplaceFeedbackRequestStatusBody,
    UpdateFeedbackRequestStatusBody
} from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { feedbackRequestService } from '../service';
import { presentFeedbackRequest } from '../presenter';

/**
 * `PUT` and `PATCH /feedback/:id` — one handler pair over `updateStatusById`, which audits the
 * change itself.
 */
export const { replace: replaceFeedbackStatus, update: updateFeedbackStatus } =
    createUpdateController({
        versioned: false,
        entity: 'feedbackStatus',
        notFoundKey: 'generic.error-not-found',
        replaceSchema: ReplaceFeedbackRequestStatusBody,
        patchSchema: UpdateFeedbackRequestStatusBody,
        update: (id, changes, request) =>
            feedbackRequestService.updateStatusById(id, changes, callerContextOf(request)),
        present: (row) => presentFeedbackRequest(row)
    });
