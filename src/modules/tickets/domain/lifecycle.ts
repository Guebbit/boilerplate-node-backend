/**
 * @module
 * A ticket's lifecycle. `status` is read-only on the wire: it moves only through three doors
 * (`resolve`, `mark-spam`, `reopen`) and through assignment (`new` <-> `in_progress`). Each door
 * here is a pure function from the ticket's facts to the write it owes, or to the refusal.
 *
 *   open   = new | in_progress     closed = resolved | spam
 *
 * Closing stamps `closedAt` (the retention clock), `resolution` and unsets `openKey` (the dedup
 * key). Reopening undoes all three. `dueAt` is NOT touched by any door: the clock belongs to the
 * situation (an FTC deadline does not restart because staff reopened), not to the reopen.
 */

import { TicketStatus } from '@types';

/** The facts a transition reads. */
export interface TicketFacts {
    status: TicketStatus;
    closedAt?: Date;
    respondedAt?: Date;
    assigned: boolean;
    openKey?: string;
    kind: string;
    link?: { type: string; id: string };
}

/** The write a transition owes: fields to set, fields to unset. */
export interface TicketPatch {
    set: Record<string, unknown>;
    unset: string[];
}

/** Why a door refused. */
export type TicketRefusal = 'already_resolved' | 'already_spam' | 'already_open';

/** A door's answer. */
export type Transition = { patch: TicketPatch } | { refusal: TicketRefusal };

/** The statuses that still owe work. */
export const OPEN_STATUSES: readonly TicketStatus[] = [TicketStatus.new, TicketStatus.in_progress];

/**
 * Whether a status is one that still owes work.
 *
 * @param status - the ticket's status
 */
export const isOpen = (status: TicketStatus): boolean => OPEN_STATUSES.includes(status);

/**
 * The dedup key of an open system ticket: one open ticket per kind and record. A visitor message
 * has none (two people may ask the same thing).
 *
 * @param kind - the ticket's kind
 * @param link - the record the ticket is about
 */
export const openKeyOf = (kind: string, link: { type: string; id: string }): string =>
    `${kind}:${link.type}:${link.id}`;

/** The status a freshly filed ticket starts at: `spam` is closed at birth. */
export const initialTicketStatus = (suspectedSpam: boolean): TicketStatus =>
    suspectedSpam ? TicketStatus.spam : TicketStatus.new;

/**
 * Staff resolve a ticket: from `new`, `in_progress` or `spam`. `closedAt` is kept when the ticket
 * was already closed (spam to resolved), `respondedAt` stamps once.
 *
 * @param ticket - its facts
 * @param now - the clock
 */
export const resolve = (ticket: TicketFacts, now: Date): Transition =>
    ticket.status === TicketStatus.resolved
        ? { refusal: 'already_resolved' }
        : {
              patch: {
                  set: {
                      status: TicketStatus.resolved,
                      resolution: 'staff',
                      closedAt: ticket.closedAt ?? now,
                      respondedAt: ticket.respondedAt ?? now
                  },
                  unset: ['openKey']
              }
          };

/**
 * Staff mark a ticket as spam: from `new`, `in_progress` or `resolved`. Same stamps as a
 * resolve, with `resolution: spam` and no `respondedAt`.
 *
 * @param ticket - its facts
 * @param now - the clock
 */
export const markSpam = (ticket: TicketFacts, now: Date): Transition =>
    ticket.status === TicketStatus.spam
        ? { refusal: 'already_spam' }
        : {
              patch: {
                  set: {
                      status: TicketStatus.spam,
                      resolution: 'spam',
                      closedAt: ticket.closedAt ?? now
                  },
                  unset: ['openKey']
              }
          };

/**
 * Staff reopen a closed ticket: to `in_progress` when it has an assignee, else `new`. Unsets
 * `closedAt` (so the retention clock stops) and `resolution`, and restores the dedup key of a
 * linked ticket.
 *
 * @param ticket - its facts
 */
export const reopen = (ticket: TicketFacts): Transition =>
    isOpen(ticket.status)
        ? { refusal: 'already_open' }
        : {
              patch: {
                  set: {
                      status: ticket.assigned ? TicketStatus.in_progress : TicketStatus.new,
                      ...(ticket.link ? { openKey: openKeyOf(ticket.kind, ticket.link) } : {})
                  },
                  unset: ['closedAt', 'resolution']
              }
          };
