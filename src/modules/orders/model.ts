/**
 * @module
 * The order Mongoose schema and the serialization transform that derives its wire-only totals.
 *
 * Snapshot: an order embeds the product SNAPSHOT it was bought against
 *           (`orderLineProductSchema`, no `ref`, and NOT `productSchema` — see the note there)
 *           rather than referencing the live catalogue row, since a later product edit must not
 *           rewrite purchase history. It is not just a copy of the product row: `title`/
 *           `description` are that product's text as resolved into the buyer's language at
 *           order-creation time, then frozen — each item carries the `locale` that resolution
 *           happened in, so a later read reproduces what was actually bought rather than
 *           re-resolving against whoever happens to be reading it. See `./services/snapshot`.
 * Totals:   `totalItems`, `totalQuantity` and `totalPrice` are never stored — `applyOrderTransform`
 *           derives them from `items` at the single serialization point every response passes
 *           through, letting the contract mark them required.
 *
 * See: docs/modules/orders.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { ProductSnapshot } from '@modules/products';
import { revisionPlugin } from '@infrastructure/persistence/revision-plugin';
import { applySerialization } from '@infrastructure/persistence/serialize';
import {
    bankTransferBeneficiary,
    bankTransferIbanFriendly,
    transferInstructionsFor
} from './config';
import { sumLineItems, orderTotal, type LineItem } from './domain/totals';
import { orderTaxBreakdown, type TaxableLineItem } from './domain/tax';
import { isPayable } from './domain/lifecycle';
import {
    fulfillmentStatusOf,
    paymentStatusOf,
    returnStatusOf,
    type StampedPaymentStatus,
    type StampedReturnStatus
} from './domain/projections';
import { orderCurrency } from './config';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * `ProductSnapshot` minus `taxClass`, plus the resolved `taxRate` — same reasoning as
 * `ProductSnapshot` itself omitting `onHand`/`reserved`: an order line freezes the RESOLVED rate,
 * never the class it came from, so the class must not even be reachable to store here.
 *
 * `rateType` is NOT omitted — unlike `taxClass`, it has no resolved numeric form to stand in for
 * it, so it stays on `ProductSnapshot` and rides across untouched, the same as `sku`/`weight`.
 */
export type FrozenOrderLineProduct = Omit<ProductSnapshot, 'taxClass'> & {
    /** The decimal VAT rate this line was actually charged — see the schema field's own comment. */
    taxRate: number;
};

/**
 * A single item stored inside an order document. Uses `ProductSnapshot` rather than OpenAPI's
 * `OrderItem`, since Mongoose embeds the product directly — and not `ProductDocument`, since
 * what's embedded is a subdocument with none of `Document`'s methods on it.
 *
 * `product.title`/`description` are not the catalogue's own words: they are that product's text
 * as RESOLVED into `locale` at order-creation time, then frozen. Reading them later must not
 * re-resolve against whatever locale is ambient at read time — that would let an old order's
 * copy drift into a language the buyer never saw.
 */
export interface OrderDocumentItem {
    /**
     * The product snapshot, embedded.
     *
     * Not a reference and never an `ObjectId`: `orderItemSchema` declares
     * `product: orderLineProductSchema` with no `ref`, so there is nothing for `populate()` to
     * resolve and the un-joined case cannot occur. An order must keep what was bought, not what
     * the catalogue says today — and not what the WAREHOUSE says today either, which is why the
     * embedded schema is its own, narrower than the catalogue's.
     */
    product: FrozenOrderLineProduct;
    quantity: number;
    /**
     * The language `product.title`/`description` were resolved into, frozen alongside them —
     * see `resolveSnapshotProducts` in `./services/snapshot`. Lives on the item, not the product:
     * it describes the resolution of the whole line, not a property of the product itself.
     */
    locale: string;
}

/**
 * A consequence of a cancel that the cancel itself could not guarantee.
 *
 * One member, not because the stock half always heals — it does not. The reservation sweep
 * (`inventory/repository.ts`) only matches `held` reservations; a paid order's `committed` hold,
 * restocked by the cancel rather than released, is never retried if that restock throws, and those
 * units are lost from sale for good. The money half is tracked here because the domain event bus
 * has no retry of its own: a refund that throws is lost unless the intent to make it survives the
 * failure.
 */
export type OrderPendingEffect = 'refund';

/**
 * Order Document interface: overrides the generated `Order`'s `userId`/`items`/`status`, and
 * redeclares `deletedAt`/`payBy` as `Date` (the contract types both as ISO strings).
 * `totalItems`, `totalQuantity`, `totalPrice` and `transferInstructions` are omitted rather than
 * inherited — required or present on the wire but never persisted, so declaring them here would
 * claim a stored field that doesn't exist; `applyOrderTransform` derives all four at
 * serialization time.
 */
export interface OrderDocument
    extends
        Omit<
            Order,
            | 'id'
            | 'userId'
            | 'status'
            | 'items'
            | 'totalItems'
            | 'totalQuantity'
            | 'totalPrice'
            | 'createdAt'
            | 'updatedAt'
            | 'deletedAt'
            | 'payBy'
            | 'orderNumber'
            | 'currency'
            | 'transferInstructions'
            | 'paymentStatus'
            | 'fulfillmentStatus'
            | 'returnStatus'
        >,
        Document {
    /**
     * Absent on an order whose account was erased. The invoice survives erasure
     * (Art. 17(3)(b)/(e)); the account it belonged to does not, and unlike every other document
     * here that IS the dangling foreign key, not a bug in it. See `anonymizeAfter`.
     */
    userId?: Types.ObjectId;
    status: OrderStatus;
    notes?: string;
    items: OrderDocumentItem[];
    createdAt?: Date;
    updatedAt?: Date;
    /** When this order's stock hold ends — see the schema field's own comment. */
    payBy?: Date;
    /**
     * `{year}-{sequence}`, assigned once by `allocateOrderNumber` at order-creation time — never
     * recomputed, unlike the VAT figures. Not a tax invoice number: this order is a receipt, not
     * an invoice — see `docs/modules/orders.md`. Absent on an order that predates this field; it
     * never gets one retroactively, since a number minted later could not honestly claim the
     * order's actual place in the sequence.
     */
    orderNumber?: string;
    /**
     * ISO-4217, frozen from `shopCurrency()` the moment `placeOrder` writes the row — never
     * re-read from config later, so a deployment's currency change cannot rewrite what an old
     * order actually charged. Absent on an order that predates this field.
     */
    currency?: string;
    /**
     * Set alongside `userId` being unset, to `max(now, createdAt + NODE_ORDER_PII_RETENTION_DAYS)`
     * — an order already past its own window at erasure time is due almost immediately, not given
     * a fresh retention period. `scripts/ops/reap-orders.ts` scrubs the order's remaining PII
     * (email, shipping name/phone/street, notes) once this elapses; the order row itself is never
     * deleted.
     */
    anonymizeAfter?: Date;
    /**
     * The moment `services/status.ts#markPaid` moved this order to `paid` — written in the SAME
     * conditional write as the status move, by whichever caller wins that transition, never
     * recomputed afterwards. Internal only: never on the wire (see `applyOrderTransform`'s `omit`).
     *
     * The proxy every cross-module read uses instead of asking `invoicing` whether an invoice
     * exists — `services/scope.ts#withActions`' `actions.invoice`, and `services/remove.ts#remove`'s
     * no-hard-delete-once-invoiced guard both read this rather than importing that module, keeping
     * `orders` free of a dependency on the module that depends on it. An invoice is issued at this
     * same instant (`invoicing`'s own `ORDER_STATUS_CHANGED` listener), so the two normally agree;
     * a listener failure is the one documented gap, the same policy `orderNumber` already accepts.
     * Absent on an order that has never reached `paid`.
     */
    paidAt?: Date;
    /**
     * The last instant a withdrawal is valid, frozen when its clock starts: delivery for goods,
     * `paidAt` for digital content (Art. 9(2)). Absent until then — the right already exists, the
     * window has no end yet — and never recomputed, so a config change cannot move a promise
     * already made. Internal: clients read it as `actions.withdrawUntil`.
     */
    withdrawUntil?: Date;
    /**
     * The refund state of the money, stamped by `payments` through `services/status.ts`'s
     * `markPaymentStatus`. Absent until a refund exists — `paid`/`unpaid` are derived from `paidAt`
     * on read, so nothing here can disagree with it. The wire's `paymentStatus` is derived from this.
     */
    paymentStatus?: StampedPaymentStatus;
    /**
     * Where any return stands, stamped by `returns` through `markReturnStatus`. Absent while none
     * holds goods. The wire's `returnStatus` is derived from this.
     */
    returnStatus?: StampedReturnStatus;
    /**
     * What the cancel decided but has not yet seen through. Written in the same conditional write
     * that moves the status, so the intent and the decision cannot come apart; emptied once the
     * listener has actually returned. Non-empty means `retryPendingEffects` still owes this order
     * something — absent and empty both mean settled.
     */
    pendingEffects?: OrderPendingEffect[];
    /**
     * The RF creditor reference this order's `bank_transfer` checkout minted
     * (`src/modules/orders/domain/transfer-reference.ts`'s `buildReference`), from the SAME id
     * this write creates — never recomputed afterwards.
     *
     * Absent:  on a `card` order, and on a `bank_transfer` order that predates this field —
     *          `applyTransferInstructions` then shows no `transferInstructions` block at all
     *          rather than a fabricated reference, and `GET /payments/order-by-reference` simply
     *          cannot reach that order (its admin finds it by id through the normal order search
     *          instead).
     * On wire: not part of the `Order` contract — `applyOrderTransform` omits it, the same
     *          treatment as `anonymizeAfter`/`pendingEffects` below, and it is surfaced only
     *          through `transferInstructions.reference`.
     */
    transferReference?: string;
    /**
     * The admin-override history — `services/override.ts`'s only writer, never emptied. Absent
     * (not `[]`) on an order no override has ever touched, the same "owes nothing" vs. "was never
     * asked" distinction `pendingEffects` already uses. Each entry is one override, forced or
     * status-only; `PUT`/`POST` normal writes never append here.
     */
    statusOverrides?: OrderStatusOverride[];
    deletedAt?: Date;
}

/** One admin override event, embedded in order-arrival order — never reordered or deleted. */
export interface OrderStatusOverride {
    /** The order's status immediately before this override. */
    from: OrderStatus;
    /** The status this override moved the order to. */
    to: OrderStatus;
    /** `'forced'` — a delivery door skipped its normal `from` gate; `'status'` — the status-only door. */
    mode: 'forced' | 'status';
    /** Required on every override — why the normal path didn't apply. */
    reason: string;
    /**
     * The admin who made the call, as `caller.id` gave it. A plain string, not an ObjectId: this
     * is a historical record, never queried by it, and `Caller.id` carries no guarantee of being
     * one (an API-key caller, or a test fixture, can hand it a value that is not).
     */
    actorUserId: string;
    at: Date;
}

/**
 * Order Document model type.
 * Business logic lives in the service (`./services`); queries live in the repository
 * (`./repository`).
 */
export type OrderModel = Model<OrderDocument>;

/**
 * The embedded address both `shippingAddress` and `billingAddress` use — a frozen copy of a book
 * entry. `_id: false` because the shared `OrderAddress` contract schema is
 * `additionalProperties: false`.
 */
const orderAddressSchema = new Schema(
    {
        fullName: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        zip: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String }
    },
    { _id: false }
);

/**
 * Schema for the product snapshot embedded on an order line — `openapi.root.yaml`'s
 * `OrderLineProduct`, not `Product`.
 *
 * No counters: no `onHand`, no `reserved`, and therefore nothing for a response to derive
 *              `available` FROM. Deliberately its own schema rather than `productSchema` reused:
 *              the two counters describe the warehouse right now, and an order line must not be
 *              ABLE to store them, not merely choose not to.
 * No picture:  no `imageUrl`/`thumbnailUrl` either — the picture is not a term of the sale, and
 *              freezing a url rather than the bytes never made it durable: the file it names can
 *              be replaced or unlinked at any time. `./current` resolves it LIVE instead, from
 *              the catalogue id this schema still carries.
 * Timestamps:  `{ timestamps: true }`, matching `productSchema` — a subdocument stamps its own
 *              `createdAt`/`updatedAt` on insert regardless of the parent's timestamps option,
 *              which is why `orders/factories.ts` carries the catalogue row's own dates in
 *              explicitly rather than leaving them to default.
 */
const orderLineProductSchema = new Schema(
    {
        title: { type: String, required: true },
        price: { type: Number, required: true },
        description: { type: String },
        categories: { type: [String] },
        tags: { type: [String] },
        active: { type: Boolean },
        requiresShipping: { type: Boolean },
        /** Art. 16 exclusion, frozen the same as every other line field — see `Product.noWithdrawal`. */
        noWithdrawal: { type: Boolean },
        /** SH4, frozen the same as every other line field — see `Product.sku`. No uniqueness
         * constraint here: the constraint is on the CATALOGUE, and a frozen copy is history. */
        sku: { type: String },
        /** Grams, frozen the same as every other line field — see `Product.weight`. */
        weight: { type: Number, min: 0 },
        deletedAt: { type: Date },
        /*
         * The decimal rate this line was actually charged, resolved from the product's `taxClass`
         * at freeze time (`services/snapshot.ts`) — never the class itself, and never re-resolved
         * from the product's CURRENT class.
         */
        taxRate: { type: Number, required: true, min: 0, max: 1 },
        /**
         * WHY `taxRate` is 0, when it is — copied straight from `Product.rateType`, unlike
         * `taxClass` above it (resolved into `taxRate`, then discarded). There is no numeric rate
         * for `rateType` to resolve into, and an invoice needs the category (Z vs E) the order was
         * actually placed under — see `services/snapshot.ts#freezeOrderLines`.
         */
        rateType: { type: String, enum: ['standard', 'zero-rated', 'exempt'] }
    },
    { timestamps: true }
);

/**
 * The embedded snapshot's own wire-shape transform — `_id` → `id`, `__v` dropped, nothing derived:
 * unlike `applyProductTransform`, there is no `available` to compute, because there is no
 * `onHand`/`reserved` on this schema to compute it FROM.
 */
const applyOrderLineProductTransform = applySerialization(orderLineProductSchema);

/**
 * Schema for a single embedded order item.
 * `_id: false` — OpenAPI's OrderItem is `{product, quantity}` only
 * (`additionalProperties: false`), so items don't need their own id.
 */
const orderItemSchema = new Schema(
    {
        product: { type: orderLineProductSchema },
        quantity: {
            type: Number,
            required: true
        },
        // The language `product.title`/`description` were resolved into when this line was
        // frozen — see `OrderDocumentItem.locale`.
        locale: {
            type: String,
            required: true
        }
    },
    { _id: false }
);

/**
 * Mongoose schema for persisted order documents.
 */
export const orderSchema = new Schema<OrderDocument>(
    {
        // Not `required`, unlike everywhere else this repository stores a foreign key — erasure
        // unsets it deliberately, rather than deleting the invoice.
        userId: {
            type: Schema.Types.ObjectId
        },
        email: {
            type: String,
            required: true,
            // Same casters as `users.email` — every stored row is consistently cased, whatever
            // casing the snapshot was taken with. Search is aggregation-based here (`repository.ts`
            // `search`), which does not cast `$match`, so its own `withNormalizedEmailFilter`
            // normalises the QUERY side to match.
            lowercase: true,
            trim: true
        },
        items: [orderItemSchema],
        status: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.pending
        },
        notes: {
            type: String
        },
        /*
         * The shipping choice, frozen at checkout: the method's id and what it COST THEN, so a
         * later rate change can't re-price history. Both fields are absent together when no
         * method was chosen (free-above-threshold or a genuinely free method like `pickup` still
         * freezes `shippingMethod` — it is present, `shippingCost` is legitimately `0`; only "no
         * method at all" leaves both unset) — `orderTotal` already tolerates an absent value.
         */
        shippingMethod: {
            type: String
        },
        shippingCost: {
            type: Number,
            min: 0
        },
        /*
         * The customer's checkout choice — a preference, not a lock: a card payment still
         * settles normally regardless of this value, and then rewrites it to `card`, so the
         * field ends up saying how the order was actually paid. Absent on orders placed before
         * this existed, and on order creation that isn't a checkout.
         */
        paymentMethod: {
            type: String,
            enum: ['card', 'bank_transfer']
        },
        /*
         * When this order's stock hold ends, stamped at checkout from the SAME duration handed
         * to `inventoryService.reserveForOrder` — the two must never disagree, which is why
         * neither is a second copy of the other's fallback. Absent once paid or cancelled: the
         * hold is over either way, and on orders that predate this field.
         */
        payBy: {
            type: Date
        },
        /*
         * `{year}-{sequence}`, minted once by `allocateOrderNumber` (`./services/order-numbering`)
         * at order-creation time. Not a tax invoice number — this order is a receipt, not an
         * invoice, see `docs/modules/orders.md`. Absent on an order that predates this feature;
         * never assigned retroactively.
         */
        orderNumber: {
            type: String
        },
        /*
         * Stamped once, in the same conditional write that moves the order to `paid` — see the
         * interface field's own comment for what reads it.
         */
        paidAt: {
            type: Date
        },
        // Frozen once, when the withdrawal clock starts — see the interface field's own comment.
        withdrawUntil: {
            type: Date
        },
        // Stamped by the owning module, never by `orders` itself — see the interface fields.
        paymentStatus: {
            type: String,
            enum: ['partially_refunded', 'refunded']
        },
        returnStatus: {
            type: String,
            enum: ['requested', 'in_progress', 'partially_returned', 'returned']
        },
        /*
         * ISO-4217, frozen from `shopCurrency()` at the same moment `orderNumber` is minted —
         * never re-read from config later, so a deployment's currency change cannot rewrite what
         * an old order actually charged. Absent on an order that predates this field.
         */
        currency: {
            type: String
        },
        /*
         * The address the order ships to — a SNAPSHOT, exactly like the product snapshots in
         * `items`: an order keeps where it was going, not what the address book says today.
         * Present only when a line ships to an address: absent on an all-digital order, a pickup,
         * and orders that predate the book.
         */
        shippingAddress: {
            type: orderAddressSchema
        },
        /*
         * Who the order is invoiced to — a snapshot like `shippingAddress`, and the one the invoice
         * reads (`invoicing/services/issue-invoice.ts`). Present on every order a checkout places;
         * absent on an admin-created order (no checkout) and on one placed before this field.
         */
        billingAddress: {
            type: orderAddressSchema
        },
        /*
         * Set when an order is soft-deleted. Orders carry no `active` flag, so unlike a product
         * this is the only fact that hides one: `callerScope` (`services/scope.ts`) requires its
         * absence for a non-admin, and an admin passes no scope at all, which is how a
         * soft-deleted order stays readable to them.
         */
        deletedAt: {
            type: Date
        },
        anonymizeAfter: {
            type: Date
        },
        /*
         * `default: undefined` overrides Mongoose's implicit `[]` for an array path, so an order
         * that never cancelled carries no key at all — the difference between "owes nothing" and
         * "was never asked". Only the cancel's own write creates it.
         */
        pendingEffects: {
            type: [String],
            enum: ['refund'],
            default: undefined
        },
        /*
         * The RF reference `placeOrder` mints for a `bank_transfer` order, from the same id this
         * write creates. Absent on a `card` order and on an order that predates this field — no
         * `required`, matching that.
         */
        transferReference: {
            type: String
        },
        /*
         * `default: undefined`, same reasoning as `pendingEffects` above: an order no override has
         * ever touched carries no key at all. Only `services/override.ts`'s `$push` creates it.
         */
        statusOverrides: {
            type: [
                new Schema<OrderStatusOverride>(
                    {
                        from: { type: String, enum: Object.values(OrderStatus), required: true },
                        to: { type: String, enum: Object.values(OrderStatus), required: true },
                        mode: { type: String, enum: ['forced', 'status'], required: true },
                        reason: { type: String, required: true },
                        actorUserId: { type: String, required: true },
                        at: { type: Date, required: true }
                    },
                    { _id: false }
                )
            ],
            default: undefined
        }
    },
    {
        // Automatically manages createdAt and updatedAt timestamps
        timestamps: true
    }
);

/**
 * The edit counter behind this resource's `ETag` and `If-Match` — see `@infrastructure/persistence/revision-plugin`.
 */
orderSchema.plugin(revisionPlugin);

/*
 * Indexes, declared on the schema so this is the one place deciding what's indexed. Names are
 * given rather than derived — Mongo identifies an index by name, so reusing a key under a new
 * name fails at startup instead of silently doing nothing; these are the names the databases
 * already carry.
 */
/* "My orders" lookups, newest first. */
orderSchema.index({ userId: 1, createdAt: -1 }, { name: 'orders_userId_createdAt' });
/* An order remembers the address it was placed from, which is how guests' orders are found. */
orderSchema.index({ email: 1 }, { name: 'orders_email' });
/* Non-admin reads exclude soft-deleted rows (`callerScope` in `services/scope.ts`). */
orderSchema.index({ userId: 1, deletedAt: 1 }, { name: 'orders_userId_deletedAt' });
/*
 * `scripts/ops/reap-orders.ts`'s own sweep — NOT a TTL index: the row must survive, only its PII
 * gets scrubbed, so nothing here may carry `expireAfterSeconds`.
 */
orderSchema.index({ anonymizeAfter: 1 }, { name: 'orders_anonymizeAfter', sparse: true });
/*
 * `retryPendingEffects`'s query — orders still owing an effect, oldest first. Sparse, so it holds
 * only the handful of orders between a cancel and its consequences rather than every order ever
 * placed. An empty array indexes no key, which is why draining the field is enough to leave it.
 */
orderSchema.index(
    { pendingEffects: 1, updatedAt: 1 },
    { name: 'orders_pendingEffects', sparse: true }
);
/*
 * `GET /payments/order-by-reference`'s lookup. Unique — two orders minting the same reference
 * would make the code ambiguous about which one a transfer paid — and sparse for the same reason
 * as the two sweeps above: most orders (every `card` one) never carry this field at all.
 */
orderSchema.index(
    { transferReference: 1 },
    { name: 'orders_transferReference', unique: true, sparse: true }
);

/**
 * Recursively normalizes each line's embedded product snapshot — `_id` → `id`, `__v` dropped.
 */
const applyOrderItems = (serialized: Record<string, unknown>) => {
    if (!Array.isArray(serialized.items)) return;

    for (const item of serialized.items as Record<string, unknown>[]) {
        if (item.product && typeof item.product === 'object')
            applyOrderLineProductTransform(item.product as Record<string, unknown>);
    }
};

/**
 * Derives `totalItems`, `totalQuantity` and `totalPrice` from `items`, at the single
 * serialization point every response passes through, so list, both `getById` branches, create
 * and update all agree. (Name collision with `PaginationMeta.totalItems` — unrelated,
 * pre-existing.)
 */
const applyOrderTotals = (serialized: Record<string, unknown>, currency: string) => {
    const items = Array.isArray(serialized.items) ? (serialized.items as LineItem[]) : [];
    const { count, quantity } = sumLineItems(items, currency);

    serialized.totalItems = count;
    serialized.totalQuantity = quantity;
    // What the customer owes, from the one function that decides it — the same call the payment
    // intent and the confirmation email make, so the three cannot quote different numbers.
    serialized.totalPrice = orderTotal({ items, shippingCost: serialized.shippingCost, currency });
};

/**
 * Derives each line's `taxAmount`/`netAmount`, the order's `netTotal`/`taxTotal`, shipping's own
 * `shippingNetAmount`/`shippingTaxAmount` split, and the per-rate `taxSummary` from the lines'
 * frozen `taxRate` — added onto the already-normalized items `applyOrderItems` produced.
 */
const applyOrderTax = (serialized: Record<string, unknown>, currency: string) => {
    const items = Array.isArray(serialized.items) ? serialized.items : [];
    // `orderTaxBreakdown` only reads `product.price`/`quantity`/`product.taxRate` — the same
    // narrowing `applyOrderTotals` above already relies on for `LineItem`.
    const breakdown = orderTaxBreakdown({
        items: items as TaxableLineItem[],
        shippingCost: serialized.shippingCost,
        currency
    });

    for (const [index, item] of (items as Record<string, unknown>[]).entries()) {
        item.taxAmount = breakdown.lines[index].taxAmount;
        item.netAmount = breakdown.lines[index].netAmount;
    }
    serialized.netTotal = breakdown.netTotal;
    serialized.taxTotal = breakdown.taxTotal;
    serialized.shippingNetAmount = breakdown.shippingNetAmount;
    serialized.shippingTaxAmount = breakdown.shippingTaxAmount;
    serialized.taxSummary = breakdown.taxSummary;
};

/**
 * `transferInstructions`, present only while a `bank_transfer` order is still `pending` AND has a
 * reference to show — once paid or cancelled there is nothing left to act on, and an order placed
 * before `transferReference` existed has no reference to show at all, rather than a fabricated
 * one. Read live from whatever the deployment currently has configured rather than frozen at
 * checkout time: the beneficiary/IBAN/BIC are deployment config, not order-specific data, so a
 * later change should show up on every still-pending order instead of staying locked to what was
 * true when it was placed. `reference` IS order-specific — the RF code `buildReference` minted at
 * checkout.
 */
const applyTransferInstructions = (serialized: Record<string, unknown>) => {
    // Read before it is stripped, on every path below — never part of the wire, and `omit` above
    // runs before this callback, too early to strip a field this function still needs to read.
    const reference = serialized.transferReference as string | undefined;
    delete serialized.transferReference;

    if (
        serialized.paymentMethod !== 'bank_transfer' ||
        // Still payable, not literally `pending`: the same question `isPayable` answers
        // everywhere else a caller asks "can this order still be paid" — a status literal here
        // would drift from the lifecycle table the moment a new pre-paid status ever exists.
        !isPayable(serialized.status as OrderStatus) ||
        !reference
    )
        return;

    if (!bankTransferBeneficiary() || !bankTransferIbanFriendly()) return;

    serialized.transferInstructions = transferInstructionsFor(reference);
};

/**
 * The three statuses beside `status`, resolved from what is stored — and `paidAt` stripped, since
 * this is its last reader. It is not in `omit` for that reason: `omit` runs before `after`, and the
 * `paid`/`unpaid` half of `paymentStatus` is derived from it.
 * @param serialized - the order as it is being serialized
 */
const applyOrderProjections = (serialized: Record<string, unknown>) => {
    serialized.paymentStatus = paymentStatusOf(
        serialized.paymentStatus as StampedPaymentStatus | undefined,
        serialized.paidAt as Date | undefined
    );
    serialized.fulfillmentStatus = fulfillmentStatusOf(serialized.status as OrderStatus);
    serialized.returnStatus = returnStatusOf(
        serialized.returnStatus as StampedReturnStatus | undefined
    );
    delete serialized.paidAt;
};

/**
 * Normalizes a serialized order: the shared `_id` → `id` and `__v` removal, plus this
 * collection's own jobs — cleaning up the embedded items, deriving the totals, and computing
 * `transferInstructions`. Exported so aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see `normalize` in @infrastructure/persistence/create-repository.
 */
export const applyOrderTransform = applySerialization(orderSchema, {
    // `anonymizeAfter` is the reaper's own bookkeeping and `pendingEffects` the cancel sweep's,
    // neither part of the `Order` contract — same reasoning as `users`' `pendingImageKey`/
    // `inactivityWarnedAt`. `statusOverrides` is staff-only history (who overrode the status, and
    // why) — never the owning customer's to read off their own order. `paidAt` is internal
    // bookkeeping too — see the schema field's own comment — and is stripped in
    // `applyOrderProjections`, not here. `transferReference` is NOT
    // listed here: `omit` runs before `after` below, and `applyTransferInstructions` still needs
    // to read it — it strips the raw field itself, once it no longer does.
    omit: ['anonymizeAfter', 'pendingEffects', 'statusOverrides', 'withdrawUntil'],
    after: (serialized) => {
        applyOrderItems(serialized);
        // Resolved once, not read twice: an order predating `currency` falls back to the shop's
        // current setting, same rule `issue-invoice.ts` freezes an invoice's own currency with.
        const currency = orderCurrency({ currency: serialized.currency as string | undefined });
        applyOrderTotals(serialized, currency);
        applyOrderTax(serialized, currency);
        applyTransferInstructions(serialized);
        applyOrderProjections(serialized);
    }
});

/**
 * Mongoose model for order CRUD operations.
 */
export const orderModel = model<OrderDocument, OrderModel>('Order', orderSchema);

/**
 * One document per calendar year, holding the running order-number sequence — `_id` IS the year,
 * so `repository.ts`'s atomic upsert addresses it directly, with no lookup first. Same convention
 * as `LeaseDocument` (`@infrastructure/persistence/lease`). Lives here, not in `services/`: this
 * module's one door for a persistence handle is `model.ts`/`repository.ts`, same as `orderModel`.
 */
export interface OrderNumberCounterDocument extends Document<number> {
    seq: number;
}

/** Mongoose model type for {@link OrderNumberCounterDocument}. */
export type OrderNumberCounterModel = Model<OrderNumberCounterDocument>;

/** Order-number counter schema — incremented atomically by `repository.ts`'s `incrementOrderNumberCounter`. */
const orderNumberCounterSchema = new Schema<OrderNumberCounterDocument, OrderNumberCounterModel>({
    _id: { type: Number },
    seq: { type: Number, required: true, default: 0 }
});

/** Order-number counter model. Collection name `ordernumbercounters`, Mongoose's default pluralization. */
export const orderNumberCounterModel = model<OrderNumberCounterDocument, OrderNumberCounterModel>(
    'OrderNumberCounter',
    orderNumberCounterSchema
);
