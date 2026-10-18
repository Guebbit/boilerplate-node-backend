/**
 * @module
 * Fulfilment rules — how an order's lines split into fulfillment orders, what remains of each,
 * which status follows from its lines, and the summary `orders` carries. Pure, so every case is
 * testable without a database. See `docs/modules/delivery.md#the-two-records`.
 */

import {
    FulfillmentConsent,
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus
} from '@types';

/** One product on a fulfillment order, with how much of it has gone each way. */
export interface FulfillmentLine {
    productId: string;
    /** The product's title as the order froze it — what a shipment email and a screen show. */
    title: string;
    quantity: number;
    shippedQuantity: number;
    cancelledQuantity: number;
}

/** A line as the grouping rule reads it off an order's frozen snapshot. */
export interface GroupableLine {
    productId: string;
    title: string;
    quantity: number;
    /** Whether the line rides in a parcel; `false` for digital goods. */
    ships: boolean;
    /** Frozen at checkout: the line is a preorder. Never read from the product at payment time. */
    preorder?: boolean;
    /** Frozen at checkout: when a preorder line is expected. Only meaningful with `preorder`. */
    releaseDate?: Date;
    /**
     * Frozen at checkout: the line is goods Art. 16 CRD takes the right of withdrawal from (made to
     * order, perishable). Such a line gets a fulfillment order of its own, so the buyer can cancel
     * the rest without it and the shop's work on it is never cancelled by accident.
     */
    noWithdrawal?: boolean;
}

/** A fulfillment order as the grouping rule makes it, before it is stored. */
export interface FulfillmentOrderDraft {
    number: number;
    kind: FulfillmentOrderKind;
    status: FulfillmentOrderStatus;
    lines: FulfillmentLine[];
    holdReason?: FulfillmentHoldReason;
    agreedAt?: Date;
    expectedAt?: Date;
}

/**
 * Units of one line that are neither shipped nor cancelled.
 * @param line - a fulfillment order's line
 */
export const remainingOfLine = (line: FulfillmentLine): number =>
    line.quantity - line.shippedQuantity - line.cancelledQuantity;

/**
 * Units left across a fulfillment order's lines.
 * @param lines - the lines
 */
export const remainingOf = (lines: readonly FulfillmentLine[]): number =>
    lines.reduce((total, line) => total + remainingOfLine(line), 0);

/**
 * The kind a group of lines has: `physical` if anything in it rides in a parcel.
 * @param lines - the group's lines, as grouped
 */
const kindOf = (lines: readonly GroupableLine[]): FulfillmentOrderKind =>
    lines.some(({ ships }) => ships) ? FulfillmentOrderKind.physical : FulfillmentOrderKind.digital;

/**
 * One line as a fulfillment order carries it: nothing shipped, nothing cancelled yet.
 * @param line - the order's line
 */
const toFulfillmentLine = ({ productId, title, quantity }: GroupableLine): FulfillmentLine => ({
    productId,
    title,
    quantity,
    shippedQuantity: 0,
    cancelledQuantity: 0
});

/**
 * The calendar day a preorder date falls in, as its own group key. UTC days, like every other
 * date rule here.
 * @param date - a release date
 */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The instant a group of preorder lines was promised for: the latest release date among them, since
 * the group leaves together and cannot leave before its last product exists.
 * @param group - lines of one release day, all with a date
 */
const promisedAt = (group: readonly GroupableLine[]): Date =>
    new Date(Math.max(...group.map((line) => line.releaseDate!.getTime())));

/**
 * Split an order's lines into fulfillment orders — the rule that runs when an order is paid.
 *
 * - every line that is neither a preorder nor `noWithdrawal` goes in ONE fulfillment order, `open`,
 *   `physical` if any of its lines ships and `digital` otherwise (digital lines of a mixed order
 *   ship with the physical ones);
 * - the `noWithdrawal` lines that ship now get one `open` fulfillment order of their own;
 * - preorder lines get one fulfillment order per distinct release day and per `noWithdrawal` value,
 *   `on_hold` for `awaiting_stock`, with `agreedAt` and `expectedAt` both the group's promised
 *   instant (the latest release date among its lines).
 *
 * Numbered 1.. in that order: the ordinary group that ships now first, then the made-to-order one,
 * then the preorders by date. A preorder line without a date is treated as an ordinary line: with
 * nothing to wait for it cannot be held. Keeping the made-to-order lines apart is what lets the
 * buyer cancel the ordinary rest on its own (S4 of the Q-W2 decision) while the shop's work on the
 * bespoke goods stands.
 *
 * @param lines - the order's lines with the facts frozen on them
 * @returns at least one fulfillment order for any non-empty order
 */
export const groupOrderLines = (lines: readonly GroupableLine[]): FulfillmentOrderDraft[] => {
    const waiting = lines.filter(({ preorder, releaseDate }) => preorder === true && releaseDate);
    const now = lines.filter((line) => !waiting.includes(line));
    const nowOrdinary = now.filter(({ noWithdrawal }) => noWithdrawal !== true);
    const nowBespoke = now.filter(({ noWithdrawal }) => noWithdrawal === true);

    // Key: the release day, then 0 for ordinary and 1 for bespoke, so a day's ordinary group sorts first.
    const byDay = new Map<string, GroupableLine[]>();
    for (const line of waiting) {
        const key = `${dayKey(line.releaseDate!)}|${line.noWithdrawal === true ? 1 : 0}`;
        byDay.set(key, [...(byDay.get(key) ?? []), line]);
    }

    const openGroup = (group: readonly GroupableLine[]): Omit<FulfillmentOrderDraft, 'number'>[] =>
        group.length > 0
            ? [
                  {
                      kind: kindOf(group),
                      status: FulfillmentOrderStatus.open,
                      lines: group.map((line) => toFulfillmentLine(line))
                  }
              ]
            : [];

    const drafts: Omit<FulfillmentOrderDraft, 'number'>[] = [
        ...openGroup(nowOrdinary),
        ...openGroup(nowBespoke),
        ...[...byDay]
            .toSorted(([a], [b]) => a.localeCompare(b))
            .map(([, group]) => ({
                kind: kindOf(group),
                status: FulfillmentOrderStatus.on_hold,
                lines: group.map((line) => toFulfillmentLine(line)),
                holdReason: FulfillmentHoldReason.awaiting_stock,
                agreedAt: promisedAt(group),
                expectedAt: promisedAt(group)
            }))
    ];

    return drafts.map((draft, index) => ({ ...draft, number: index + 1 }));
};

/**
 * The status a fulfillment order's lines and hold put it in. Derived, never decided by a caller:
 * nothing remains → `closed` if anything shipped from it, else `cancelled`; a hold wins over the
 * rest; otherwise `in_progress` once something shipped and `open` before.
 *
 * @param lines - the lines
 * @param held - whether a hold is in force
 */
export const statusOfLines = (
    lines: readonly FulfillmentLine[],
    held: boolean
): FulfillmentOrderStatus => {
    if (remainingOf(lines) === 0)
        return lines.some(({ shippedQuantity }) => shippedQuantity > 0)
            ? FulfillmentOrderStatus.closed
            : FulfillmentOrderStatus.cancelled;
    if (held) return FulfillmentOrderStatus.on_hold;
    return lines.some(({ shippedQuantity }) => shippedQuantity > 0)
        ? FulfillmentOrderStatus.in_progress
        : FulfillmentOrderStatus.open;
};

/** A product and how many units of it. */
export interface ProductQuantity {
    productId: string;
    quantity: number;
}

/** The verdict {@link checkShipLines} returns. */
export type ShipLinesVerdict =
    | { ok: true; lines: ProductQuantity[] }
    | { ok: false; reason: 'nothing-remains' | 'unknown-product' | 'too-many' };

/**
 * Decide which lines a shipment carries. No lines asked for means everything that remains; lines
 * asked for must each name a product on the fulfillment order and stay within what remains of it.
 * The same product named twice counts once, summed.
 *
 * @param lines - the fulfillment order's lines
 * @param requested - the lines staff asked to ship, or `undefined` for all that remains
 * @returns the lines to ship, or why the request cannot stand
 */
export const checkShipLines = (
    lines: readonly FulfillmentLine[],
    requested: readonly ProductQuantity[] | undefined
): ShipLinesVerdict => {
    const left = new Map(lines.map((line) => [line.productId, remainingOfLine(line)]));

    if (requested === undefined || requested.length === 0) {
        const all = [...left]
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity }));
        return all.length > 0 ? { ok: true, lines: all } : { ok: false, reason: 'nothing-remains' };
    }

    const summed = new Map<string, number>();
    for (const { productId, quantity } of requested)
        summed.set(productId, (summed.get(productId) ?? 0) + quantity);

    for (const [productId, quantity] of summed) {
        if (!left.has(productId)) return { ok: false, reason: 'unknown-product' };
        if (quantity > (left.get(productId) ?? 0)) return { ok: false, reason: 'too-many' };
    }

    return {
        ok: true,
        lines: [...summed].map(([productId, quantity]) => ({ productId, quantity }))
    };
};

/**
 * One line as plain data. A stored line is a Mongoose subdocument, whose fields live behind getters
 * that a spread does not copy — so a line read from the database is copied field by field before
 * anything is written back.
 * @param line - a line, plain or a stored subdocument
 */
const plainLine = (line: FulfillmentLine): FulfillmentLine => ({
    productId: line.productId,
    title: line.title,
    quantity: line.quantity,
    shippedQuantity: line.shippedQuantity,
    cancelledQuantity: line.cancelledQuantity
});

/**
 * Add what shipped to a fulfillment order's lines.
 * @param lines - the lines before
 * @param shipped - what the shipment carries; already checked against what remains
 */
export const withShipped = (
    lines: readonly FulfillmentLine[],
    shipped: readonly ProductQuantity[]
): FulfillmentLine[] => {
    const add = new Map(shipped.map(({ productId, quantity }) => [productId, quantity]));
    return lines.map((line) => ({
        ...plainLine(line),
        shippedQuantity: line.shippedQuantity + (add.get(line.productId) ?? 0)
    }));
};

/**
 * Cancel everything that remains on a fulfillment order's lines.
 * @param lines - the lines before
 */
export const withRemainderCancelled = (lines: readonly FulfillmentLine[]): FulfillmentLine[] =>
    lines.map((line) => ({
        ...plainLine(line),
        cancelledQuantity: line.cancelledQuantity + remainingOfLine(line)
    }));

/**
 * What is left on each line, as the quantities a cancel or an option lists — only lines with a
 * remainder.
 * @param lines - the lines
 */
export const remainderLines = (lines: readonly FulfillmentLine[]): ProductQuantity[] =>
    lines
        .filter((line) => remainingOfLine(line) > 0)
        .map((line) => ({ productId: line.productId, quantity: remainingOfLine(line) }));

/** The fulfillment orders and shipments the summary is computed from — only what it reads. */
export interface SummaryInputs {
    fulfillmentOrders: readonly {
        status: FulfillmentOrderStatus;
        holdReason?: FulfillmentHoldReason | undefined;
        lines: readonly FulfillmentLine[];
    }[];
    shipments: readonly {
        status: 'shipped' | 'delivered';
        deliveredAt?: Date | undefined;
    }[];
}

/** What `orders` carries about the goods — the shape `orderService.recordFulfillmentProgress` takes. */
export interface FulfillmentReport {
    shipped: boolean;
    remaining: number;
    onHold: number;
    awaitingStock: number;
    undelivered: number;
    lastDeliveredAt?: Date;
}

/**
 * The summary `orders` carries, recomputed from the records themselves — never adjusted
 * incrementally, so it cannot drift from them.
 *
 * @param inputs - every fulfillment order and shipment of one order
 */
export const summarize = ({ fulfillmentOrders, shipments }: SummaryInputs): FulfillmentReport => {
    const live = fulfillmentOrders.filter(
        ({ status }) =>
            status !== FulfillmentOrderStatus.closed && status !== FulfillmentOrderStatus.cancelled
    );
    const held = live.filter(({ status }) => status === FulfillmentOrderStatus.on_hold);
    const units = (group: typeof live): number =>
        group.reduce((total, { lines }) => total + remainingOf(lines), 0);
    const arrivals = shipments
        .map(({ deliveredAt }) => deliveredAt)
        .filter((at): at is Date => at !== undefined);
    const last = arrivals.toSorted((a, b) => b.getTime() - a.getTime()).at(0);

    return {
        shipped: shipments.length > 0,
        remaining: units(live),
        onHold: units(held),
        awaitingStock: units(
            held.filter(({ holdReason }) => holdReason === FulfillmentHoldReason.awaiting_stock)
        ),
        undelivered: shipments.filter(({ status }) => status === 'shipped').length,
        ...(last ? { lastDeliveredAt: last } : {})
    };
};

/** What the action rules read off a fulfillment order. */
export interface ActionCandidate {
    kind: FulfillmentOrderKind;
    status: FulfillmentOrderStatus;
    holdReason?: FulfillmentHoldReason | undefined;
    consent?: FulfillmentConsent | undefined;
    lines: readonly FulfillmentLine[];
}

/** Whether a status still has goods to send and nothing holding them back. */
const isWorkable = (status: FulfillmentOrderStatus): boolean =>
    status === FulfillmentOrderStatus.open || status === FulfillmentOrderStatus.in_progress;

/**
 * Whether a shipment may be cut from it: a physical one, open or in progress, with units left.
 * @param candidate - the fulfillment order
 */
export const isShippable = (candidate: ActionCandidate): boolean =>
    candidate.kind === FulfillmentOrderKind.physical &&
    isWorkable(candidate.status) &&
    remainingOf(candidate.lines) > 0;

/**
 * Whether it may be fulfilled with no shipment: a digital one, open, with units left.
 * @param candidate - the fulfillment order
 */
export const isFulfillable = (candidate: ActionCandidate): boolean =>
    candidate.kind === FulfillmentOrderKind.digital &&
    isWorkable(candidate.status) &&
    remainingOf(candidate.lines) > 0;

/**
 * Whether staff may put it on hold: workable, with units left to hold back.
 * @param candidate - the fulfillment order
 */
export const isHoldable = (candidate: ActionCandidate): boolean =>
    isWorkable(candidate.status) && remainingOf(candidate.lines) > 0;

/**
 * Whether staff may release it: on hold, and not for stock. A hand release of `awaiting_stock`
 * would ship goods the ledger never counted out — only the allocation of stock releases that hold.
 * @param candidate - the fulfillment order
 */
export const isReleasable = (candidate: ActionCandidate): boolean =>
    candidate.status === FulfillmentOrderStatus.on_hold &&
    candidate.holdReason !== FulfillmentHoldReason.awaiting_stock;

/**
 * Whether the buyer has been asked to say "keep waiting" and may answer: the fulfillment order
 * still waits for stock and its consent is `awaiting`.
 * @param candidate - the fulfillment order
 */
export const isAwaitingAnswer = (candidate: ActionCandidate): boolean =>
    candidate.status === FulfillmentOrderStatus.on_hold &&
    candidate.holdReason === FulfillmentHoldReason.awaiting_stock &&
    candidate.consent === FulfillmentConsent.awaiting;
