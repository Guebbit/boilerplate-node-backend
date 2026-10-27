/**
 * @module
 * Tickets — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The lifecycle, the jurisdiction table and the ownership rule live here rather than inline
 * in the service, so the export, the erasure and the doors all ask the same questions.
 *
 * See `docs/theory/domain-layer.md`.
 */

export {
    clear,
    initialTicketStatus,
    isOpen,
    markSpam,
    OPEN_STATUSES,
    openKeyOf,
    reopen,
    resolve,
    type TicketFacts,
    type TicketPatch,
    type TicketRefusal,
    type Transition
} from './lifecycle';
export { actionsOf, type ActionFacts, type TicketActionFlags } from './actions';
export { ownTicketsFilter, type OwnerRef, type OwnTicketsFilter } from './ownership';
export { ROUTED_SETS, routeSetOf, TICKET_KINDS, type TicketKindName } from './routing';
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
