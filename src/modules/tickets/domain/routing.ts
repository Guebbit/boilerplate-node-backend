/**
 * @module
 * Jurisdiction: which permission set works which kind of ticket. A pure table, so the one rule
 * "a role is a bundle of sets, so routing to a set routes to every role holding it" lives in one
 * place. Admin holds every set by construction, so there is no admin special case.
 */
import type { PermissionSetName } from '@api/permission-vocabulary';

import { TicketKind } from '@types';

/** Every kind of ticket: the contact form's, and the situations the system opens. */
export const TICKET_KINDS = Object.values(TicketKind);

/** The permission set that works each kind. */
const ROUTE_SET_OF_KIND: Readonly<Record<TicketKind, PermissionSetName>> = {
    contact: 'TicketDisplay',
    account_review: 'UserBanning',
    manual_refund_owed: 'PaymentRefunding',
    amount_mismatch: 'PaymentRefunding',
    refund_refused: 'PaymentRefunding',
    dispute: 'PaymentRefunding',
    paid_without_hold: 'InventoryManagement',
    export_failed: 'UserErasure',
    consent_due: 'OrderEditing'
};

/**
 * The jurisdiction of a kind, frozen onto the ticket when it opens.
 *
 * @param kind - the ticket's kind
 */
export const routeSetOf = (kind: TicketKind): PermissionSetName => ROUTE_SET_OF_KIND[kind];

/** Every set any kind is routed to, each once. */
export const ROUTED_SETS: readonly PermissionSetName[] = [
    ...new Set(Object.values(ROUTE_SET_OF_KIND))
];
