/**
 * @module
 * What each situation this module owns opens, as pure data: the kind, the record it is about, the
 * set that works it, the words staff read and the date it is due. A producer's event goes in; a
 * task's first facts come out. The dedup key and the write are other files' business.
 *
 * Every opener names its own route set, so jurisdiction needs no table of kinds here: a module
 * that adds kinds (see `shop-tasks`) hands its own `SystemOpening` to `taskService`.
 *
 * Texts are English and carry ids only, never a name or an address: they sit in the inbox of
 * every staff member who holds the set, and the linked record has the rest.
 */

import type { PermissionSetName } from '@api/permission-vocabulary';
import { TaskKind, TaskLinkType } from '@types';

const HOUR_MS = 3_600_000;

/** How long a person has to look at an account flagged for review or a failed export. */
const REVIEW_WINDOW_MS = 72 * HOUR_MS;

/** The first facts of a system task. */
export interface SystemOpening {
    /** The situation. */
    kind: TaskKind;
    /** The permission set that works it; its holders are who hear of it. */
    routeSet: PermissionSetName;
    /** The record it is about. */
    link: { type: TaskLinkType; id: string };
    /**
     * The staff screen that does the work, as a path under the staff frontend's locale
     * (`orders/<id>`, `sales/payments?tab=attention`). Opaque here: only the opener knows its screens.
     */
    work?: string;
    /** The account it is about, when there is one: the export and erasure follow it. */
    subjectId?: string;
    /** The inbox line. */
    subject: string;
    /** The task's body. */
    message: string;
    /** When it is overdue. */
    dueAt: Date;
}

/**
 * An account the shop's rule flagged for review.
 *
 * @param userId - the flagged account
 * @param now - the clock
 */
export const accountReviewOpening = (userId: string, now: Date): SystemOpening => ({
    kind: TaskKind.account_review,
    routeSet: 'UserBanning',
    link: { type: TaskLinkType.user, id: userId },
    subjectId: userId,
    subject: 'Account flagged for review',
    message: `Account ${userId} cancelled paid orders over the limit. Review it: place a purchase hold, or lift the flag.`,
    dueAt: new Date(now.getTime() + REVIEW_WINDOW_MS)
});

/**
 * A data export that could not be built: the person is still owed their file.
 *
 * @param failure - the failed export
 * @param failure.userId - whose export it is
 * @param failure.exportId - the failed export
 * @param now - the clock
 */
export const exportFailedOpening = (
    failure: { userId: string; exportId: string },
    now: Date
): SystemOpening => ({
    kind: TaskKind.export_failed,
    routeSet: 'UserErasure',
    link: { type: TaskLinkType.export, id: failure.exportId },
    subjectId: failure.userId,
    subject: 'Data export failed',
    message: `The data export of account ${failure.userId} failed. The person is owed their file within a month: ask them to request it again, or find out why it failed.`,
    dueAt: new Date(now.getTime() + REVIEW_WINDOW_MS)
});
