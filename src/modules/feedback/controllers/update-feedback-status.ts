/**
 * @module
 * Controllers for `PUT /feedback/:id` (replace) and `PATCH /feedback/:id` (merge) — admin triage
 * on a feedback ticket's status and notes, built on the shared `createUpdateController` factory.
 *
 * See: docs/modules/feedback.md
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
 * `adminNotes` gets a length cap the OpenAPI schema does not express — restated whole
 * (`.min(1).nullish()` included) so `null` still clears the notes on both verbs.
 */
const adminNotesWithCap = z.string().min(1).max(5000).nullish();

/**
 * `PUT` and `PATCH /feedback/:id` — one handler pair over `updateStatusById`, which audits the
 * change itself.
 */
export const { replace: replaceFeedbackStatus, update: updateFeedbackStatus } =
    createUpdateController({
        entity: 'feedbackStatus',
        replaceSchema: ReplaceFeedbackRequestStatusBody.extend({ adminNotes: adminNotesWithCap }),
        patchSchema: UpdateFeedbackRequestStatusBody.extend({ adminNotes: adminNotesWithCap }),
        update: (id, changes, request) =>
            feedbackRequestService.updateStatusById(id, changes, callerContextOf(request)),
        // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform; Mongoose
        // types its result `any`, and that transform is what makes it a `FeedbackRequest`.
        present: (row) => row.toJSON() as FeedbackRequest
    });
