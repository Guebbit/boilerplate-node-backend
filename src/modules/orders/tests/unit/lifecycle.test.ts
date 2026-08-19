/**
 * The order lifecycle — `src/modules/orders/domain/lifecycle.ts`. Pure: no mocks, no database.
 *
 * Asserts the SENTENCES the table encodes, not the rows. A test restating it row by row passes
 * against a table copied wrong, because the copy and the expectation are the same mistake twice.
 *
 * See `docs/theory/tactical-ddd.md` §1 for what each rule is protecting.
 */

import { OrderStatus } from '@types';
import {
    ORDER_LIFECYCLE,
    canTransition,
    orderActionsFor,
    statusesLeadingTo,
    statusesReachableFrom,
    type OrderActor
} from '../../domain/lifecycle';

const EVERY_STATUS = Object.values(OrderStatus);
const EVERY_ACTOR: readonly OrderActor[] = ['customer', 'admin', 'system'];

/** The two an HTTP caller can be. `system` names moves that follow a fact from outside the app. */
const REQUEST_ACTORS: readonly OrderActor[] = ['customer', 'admin'];

/** The order fulfilment moves through. Cancellation is not on it — it leaves the line. */
const FULFILMENT_SEQUENCE: readonly OrderStatus[] = [
    OrderStatus.pending,
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.shipped,
    OrderStatus.delivered
];

describe('the table is total over the contract', () => {
    it('has a row for every status the contract declares', () => {
        // A seventh status in `openapi.yaml` and not here is an order that can never be left.
        expect(Object.keys(ORDER_LIFECYCLE).toSorted()).toEqual([...EVERY_STATUS].toSorted());
    });

    it('names only statuses the contract declares as destinations', () => {
        const destinations = Object.values(ORDER_LIFECYCLE).flatMap((moves) => Object.keys(moves));

        expect(destinations.every((status) => EVERY_STATUS.includes(status as OrderStatus))).toBe(
            true
        );
    });

    it('gives every edge at least one actor', () => {
        // An edge nobody may take reads as permission and grants none.
        const empty = Object.entries(ORDER_LIFECYCLE).flatMap(([from, moves]) =>
            Object.entries(moves)
                .filter(([, actors]) => actors.length === 0)
                .map(([to]) => `${from} → ${to}`)
        );

        expect(empty).toEqual([]);
    });
});

describe('who may write `paid`', () => {
    it('lets nothing but the payment confirmation reach it', () => {
        // Where the payments glossary's "nothing else may set that status" is enforced.
        for (const actor of EVERY_ACTOR)
            expect(statusesLeadingTo(OrderStatus.paid, actor)).toEqual(
                actor === 'system' ? [OrderStatus.pending] : []
            );
    });

    it('refuses an operator marking an order paid by hand', () => {
        expect(canTransition(OrderStatus.pending, OrderStatus.paid, 'admin')).toBe(false);
    });
});

describe('who may cancel', () => {
    it('stops a customer once the order is in the queue', () => {
        // The refund listener is what makes `paid` cancellable.
        expect(statusesLeadingTo(OrderStatus.cancelled, 'customer')).toEqual([
            OrderStatus.pending,
            OrderStatus.paid
        ]);
    });

    it('lets an operator cancel one step further, and no further', () => {
        expect(statusesLeadingTo(OrderStatus.cancelled, 'admin')).toEqual([
            OrderStatus.pending,
            OrderStatus.paid,
            OrderStatus.processing
        ]);
    });

    it('never lets shipped goods be cancelled, by anyone', () => {
        // Goods in transit come back as a return — a flow of its own, not a rewind.
        for (const actor of EVERY_ACTOR)
            expect(canTransition(OrderStatus.shipped, OrderStatus.cancelled, actor)).toBe(false);
    });
});

describe('terminal states', () => {
    it.each([OrderStatus.delivered, OrderStatus.cancelled])('lets nobody leave %s', (status) => {
        for (const actor of EVERY_ACTOR) expect(statusesReachableFrom(status, actor)).toEqual([]);
    });

    it('refuses the move that reopens a cancelled order', () => {
        // The bug the table closes: a reopened order re-enters the customer's cancellable set.
        expect(canTransition(OrderStatus.cancelled, OrderStatus.pending, 'admin')).toBe(false);
    });

    it('refuses the move that reopens a delivered order', () => {
        for (const target of [OrderStatus.pending, OrderStatus.paid, OrderStatus.processing])
            expect(canTransition(OrderStatus.delivered, target, 'admin')).toBe(false);
    });
});

describe('direction', () => {
    it('never moves backwards along the fulfilment sequence', () => {
        // A property over the whole table, so a future edge in the wrong direction is caught
        // whether or not anyone writes a case for it.
        const backwards = FULFILMENT_SEQUENCE.flatMap((from, index) =>
            FULFILMENT_SEQUENCE.slice(0, index).flatMap((to) =>
                EVERY_ACTOR.filter((actor) => canTransition(from, to, actor)).map(
                    (actor) => `${actor}: ${from} → ${to}`
                )
            )
        );

        expect(backwards).toEqual([]);
    });
});

describe('canTransition', () => {
    it('allows a write that changes nothing', () => {
        // An admin editing an email sends the status the order already has.
        for (const status of EVERY_STATUS)
            for (const actor of EVERY_ACTOR)
                expect(canTransition(status, status, actor)).toBe(true);
    });

    it('agrees with both directions of the table', () => {
        // Separate functions with separate callers — asserted inverses, not assumed ones.
        for (const actor of EVERY_ACTOR)
            for (const from of EVERY_STATUS)
                for (const to of EVERY_STATUS) {
                    if (from === to) continue;

                    expect(statusesReachableFrom(from, actor).includes(to)).toBe(
                        statusesLeadingTo(to, actor).includes(from)
                    );
                }
    });
});

describe('orderActionsFor', () => {
    it('agrees with the table it reads', () => {
        for (const actor of EVERY_ACTOR)
            for (const status of EVERY_STATUS) {
                const actions = orderActionsFor(status, actor);

                expect(actions.transitions).toEqual(statusesReachableFrom(status, actor));
                expect(actions.cancel).toBe(
                    statusesReachableFrom(status, actor).includes(OrderStatus.cancelled)
                );
            }
    });

    it('never advertises a cancel on an order already cancelled', () => {
        // `canTransition` allows a write that changes nothing, which is right for an edit
        // repeating the current status and wrong for "may I cancel this".
        for (const actor of EVERY_ACTOR)
            expect(orderActionsFor(OrderStatus.cancelled, actor).cancel).toBe(false);
    });

    it('keeps `pay` out of the transitions it offers a REQUEST', () => {
        // Paying is a move no request makes: the answer is published so a client can offer the
        // card form, not so it can write the status. Asserted over the two actors that reach the
        // HTTP surface — `system` is the one that owns the move, and no request may claim it.
        for (const actor of REQUEST_ACTORS) {
            const actions = orderActionsFor(OrderStatus.pending, actor);

            expect(actions.pay).toBe(true);
            expect(actions.transitions).not.toContain(OrderStatus.paid);
        }
    });

    it('withdraws `pay` once the money has landed or the order is over', () => {
        for (const status of [OrderStatus.paid, OrderStatus.delivered, OrderStatus.cancelled])
            expect(orderActionsFor(status, 'admin').pay).toBe(false);
    });
});
