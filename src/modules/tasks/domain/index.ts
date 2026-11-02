/**
 * @module
 * Tasks — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The lifecycle, the jurisdiction table and the ownership rule live here rather than inline
 * in the service, so the export, the erasure and the doors all ask the same questions.
 *
 * See `docs/theory/domain-layer.md`.
 */

export {
    clear,
    initialTaskStatus,
    isOpen,
    markSpam,
    OPEN_STATUSES,
    openKeyOf,
    reopen,
    resolve,
    type TaskFacts,
    type TaskPatch,
    type TaskRefusal,
    type Transition
} from './lifecycle';
export { actionsOf, type ActionFacts, type TaskActionFlags } from './actions';
export { ownTasksFilter, type OwnerRef, type OwnTasksFilter } from './ownership';
export { ROUTED_SETS, routeSetOf, TASK_KINDS } from './routing';
export {
    accountReviewOpening,
    amountMismatchOpening,
    consentDueOpening,
    disputeOpening,
    exportFailedOpening,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening,
    type SystemOpening
} from './system';
