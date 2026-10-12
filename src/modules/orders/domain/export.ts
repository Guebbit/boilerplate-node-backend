/**
 * @module
 * What one line of the orders CSV says. The columns are the list's, in the list's words, plus the
 * order's currency (a total means nothing without it). No address: both are field-encrypted at
 * rest, and an export is not a reason to decrypt them.
 *
 * The email IS in the file, and `zod.email()` accepts `+cmd@example.com`, so a cell can start a
 * formula: escaping is the CSV writer's job (`escape_formulas`), not this file's.
 *
 * See: docs/modules/orders.md#the-csv-export
 */

import type { Order } from '@types';

/** The CSV's columns, in file order: the key is also the header. */
export const ORDER_CSV_COLUMNS = [
    'createdAt',
    'orderNumber',
    'status',
    'paymentStatus',
    'fulfillmentStatus',
    'returnStatus',
    'email',
    'lines',
    'units',
    'total',
    'currency',
    'paymentMethod',
    'paidAt'
] as const;

/** One of {@link ORDER_CSV_COLUMNS}. */
export type OrderCsvColumn = (typeof ORDER_CSV_COLUMNS)[number];

/** What a row needs from an order: a list row, as the repository normalizes it. */
export type OrderCsvSource = Pick<
    Order,
    | 'orderNumber'
    | 'status'
    | 'paymentStatus'
    | 'fulfillmentStatus'
    | 'returnStatus'
    | 'email'
    | 'totalItems'
    | 'totalQuantity'
    | 'totalPrice'
    | 'currency'
    | 'paymentMethod'
> & {
    /** A normalized row carries the stored `Date`; a serialized one the ISO string. */
    createdAt?: string | Date | undefined;
    paidAt?: string | Date | undefined;
};

/**
 * An instant as the file writes it: ISO 8601 in UTC, or empty.
 * @param value - the stored date, its ISO string, or nothing
 */
const isoOf = (value: string | Date | undefined): string =>
    value === undefined ? '' : new Date(value).toISOString();

/**
 * One order as one CSV row. Pure: the same order, the same row.
 *
 * @param order - a list row
 * @returns a cell per column; `lines` counts order lines and `units` the quantity across them
 */
export const toOrderCsvRow = (order: OrderCsvSource): Record<OrderCsvColumn, string | number> => ({
    createdAt: isoOf(order.createdAt),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    returnStatus: order.returnStatus,
    email: order.email,
    lines: order.totalItems,
    units: order.totalQuantity,
    total: order.totalPrice,
    currency: order.currency,
    paymentMethod: order.paymentMethod ?? '',
    paidAt: isoOf(order.paidAt)
});
