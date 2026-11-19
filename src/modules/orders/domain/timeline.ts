/**
 * @module
 * What an order's timeline may say, and to whom. The SET of types is generated from the contract
 * (the entry variants' `type` enums); this file adds the audience each type is for, so a type cannot exist
 * without a decision about who reads it.
 *
 * Decided per type, never by stripping fields at read time: Magento's `is_visible_on_front`,
 * WooCommerce's `is_customer_note`. A private row is hidden whole.
 *
 * @see docs/modules/orders.md#the-timeline
 */

import type { OrderTimelineEntry } from '@types';

/**
 * Every type a timeline row can have: the union of the variants' own `type` enums. The contract's
 * `OrderTimelineType` schema is the list the variants must split exactly (a contract test checks
 * it); the bundle keeps only the variants, so the type is read off them.
 */
export type OrderTimelineType = OrderTimelineEntry['type'];

/** Who a row is for: the entry's own `audience`. */
export type OrderTimelineEntryAudience = OrderTimelineEntry['audience'];

/**
 * The audience of every type. `Record` over the generated enum, so a type added to the contract
 * without a row here (a preorder's, say) fails to compile, and a row with no type does too.
 *
 * Staff only:
 *   status_overridden: carries the staff's own reason.
 *   fulfillment_held / fulfillment_released: a hold's reason is an internal call (a risk check, say).
 *   address_corrected: who changed where an order ships is the shop's own business; the buyer sees the
 *     new address on the order itself.
 *   billing_corrected: who changed the buyer's invoice details is the shop's own business; the buyer
 *     sees the corrected invoice itself (`invoice_corrected`, which is theirs).
 *   refund_failed: the provider's refusal; the buyer's answer is the refund that settles.
 *   refund_canceled: staff voided a refund that never moved money; nothing for the buyer to act on.
 *   refund_reversed: the provider took a refund back; the buyer is mailed, the row is staff's.
 *   dispute_opened / dispute_closed: the buyer's bank disputed the payment; the shop's file, not the buyer's.
 *   note_added: what staff wrote for each other (a call, an agreement); the buyer reads it only in their data export.
 */
export const TIMELINE_AUDIENCE: Readonly<Record<OrderTimelineType, OrderTimelineEntryAudience>> = {
    created: 'buyer',
    paid: 'buyer',
    processing: 'buyer',
    shipped: 'buyer',
    delivered: 'buyer',
    canceled: 'buyer',
    status_overridden: 'staff',
    payment_declined: 'buyer',
    refund_issued: 'buyer',
    refund_settled: 'buyer',
    refund_failed: 'staff',
    refund_canceled: 'staff',
    refund_reversed: 'staff',
    dispute_opened: 'staff',
    dispute_closed: 'staff',
    shipment_shipped: 'buyer',
    shipment_delivered: 'buyer',
    shipment_lost: 'buyer',
    fulfillment_held: 'staff',
    fulfillment_released: 'staff',
    remainder_canceled: 'buyer',
    return_requested: 'buyer',
    return_approved: 'buyer',
    return_declined: 'buyer',
    return_received: 'buyer',
    return_closed: 'buyer',
    return_canceled: 'buyer',
    proof_of_sending_recorded: 'buyer',
    invoice_issued: 'buyer',
    credit_note_issued: 'buyer',
    release_date_moved: 'buyer',
    delay_notice_sent: 'buyer',
    address_corrected: 'staff',
    billing_corrected: 'staff',
    invoice_corrected: 'buyer',
    note_added: 'staff'
};

/**
 * Whether a row of this type may be shown to the buyer.
 * @param type - the row's type
 */
export const isBuyerVisible = (type: OrderTimelineType): boolean =>
    TIMELINE_AUDIENCE[type] === 'buyer';

/**
 * Every type the buyer may read: what a buyer's timeline query narrows to, so the page and its
 * count hold only rows the buyer can see.
 */
export const BUYER_VISIBLE_TYPES: readonly OrderTimelineType[] = Object.entries(TIMELINE_AUDIENCE)
    // `Object.entries` loses the key type; the table is declared `Record<OrderTimelineType, …>`.
    .filter(([, audience]) => audience === 'buyer')
    .map(([type]) => type as OrderTimelineType);

/**
 * The contract's entry variant for one type: the one whose `type` enum holds it. Distributive
 * over the generated union, so a type several variants could share is still answered by one.
 * (`Extract` would return `never` for a variant whose `type` is a subset of a wider enum.)
 */
type VariantOf<T extends OrderTimelineType> = OrderTimelineEntry extends infer TVariant
    ? TVariant extends { type: infer Types }
        ? T extends Types
            ? TVariant
            : never
        : never
    : never;

/**
 * What a writer may pass as `data`: the variant's own shape, required unless the type says
 * nothing (the generated empty object is an open index signature, so it is left out).
 */
type DataField<TVariant> = TVariant extends { data: infer Data }
    ? string extends keyof Data
        ? { data?: undefined }
        : { data: Data }
    : never;

/** `text` is accepted only by a variant that declares it; no other type may carry free text. */
type TextField<TVariant> = 'text' extends keyof TVariant ? { text?: string | undefined } : unknown;

/**
 * One row for one type, distributed so each member pairs its `type` with exactly that type's
 * `data`. The variants are generated; nothing here restates a field.
 */
type InputOf<T extends OrderTimelineType> = T extends OrderTimelineType
    ? {
          /** What happened. */
          type: T;
          /** The account that made the change, as `caller.id` gives it: absent for the system. */
          actor?: string | null | undefined;
          /** When it happened; the write's own instant when omitted. */
          at?: Date | undefined;
      } & DataField<VariantOf<T>> &
          TextField<VariantOf<T>>
    : never;

/**
 * One row as `orders` writes it, from any module: a `type` and the `data` the contract gives that
 * type. Ids, codes and numbers go in `data`; free text goes in `text`, only on a type whose
 * variant carries it and only when `orders` itself owns it (it has its own retention clock).
 */
export type TimelineEntryInput = InputOf<OrderTimelineType>;
