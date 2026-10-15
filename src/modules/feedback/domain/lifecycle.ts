/**
 * @module
 * The feedback ticket's status: a closed 4-value enum (`new`/`in_progress`/`resolved`/`spam`)
 * with no gated transition graph — staff may re-triage a ticket to any status, including
 * backward, so there is no `canTransition` here the way `orders`/`payments` gate a write. What IS
 * a rule: a fresh ticket's starting status depends only on whether it looked like spam, and `resolved`
 * stamps `respondedAt` exactly once.
 */

import { FeedbackRequestStatus } from '@types';

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
