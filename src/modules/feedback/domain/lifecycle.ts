/**
 * @module
 * The feedback ticket's status: a closed 4-value enum (`new`/`in_progress`/`resolved`/`spam`)
 * with no gated transition graph — staff may re-triage a ticket to any status, including
 * backward, so there is no `canTransition` here the way `orders`/`payments` gate a write. What IS
 * a rule: a status string arriving outside the enum narrows away rather than being trusted, a
 * fresh ticket's starting status depends only on whether it looked like spam, and `resolved`
 * stamps `respondedAt` exactly once.
 */

import { FeedbackRequestStatus } from '@types';

/** Every value the generated `FeedbackRequestStatus` enum declares, for the membership check below. */
const FEEDBACK_STATUS_VALUES = Object.values(FeedbackRequestStatus) as string[];

/**
 * A write's `status` narrowed onto the closed set — unreachable with an invalid value, since the
 * generated Zod enum already answers 422 before this runs (`update-feedback-status.ts`). Exists so
 * a caller holds a real `FeedbackRequestStatus` rather than trusting the generated type alone
 * against one that bypasses the HTTP layer.
 */
export const toFeedbackStatus = (status?: string): FeedbackRequestStatus | undefined =>
    status && FEEDBACK_STATUS_VALUES.includes(status)
        ? (status as FeedbackRequestStatus)
        : undefined;

/** The status a freshly submitted ticket starts at — `spam` skips the operator notification. */
export const initialFeedbackStatus = (suspectedSpam: boolean): FeedbackRequestStatus =>
    suspectedSpam ? FeedbackRequestStatus.spam : FeedbackRequestStatus.new;

/**
 * Whether a triage write should stamp `respondedAt` — the first time a ticket reaches `resolved`,
 * never again: re-resolving an already-resolved ticket must not move the timestamp.
 * @param nextStatus - the status the write is about to apply, `undefined` when it leaves status
 *   untouched
 * @param alreadyResponded - whether `respondedAt` is already stamped on the ticket
 */
export const shouldStampRespondedAt = (
    nextStatus: FeedbackRequestStatus | undefined,
    alreadyResponded: boolean
): boolean => nextStatus === FeedbackRequestStatus.resolved && !alreadyResponded;
