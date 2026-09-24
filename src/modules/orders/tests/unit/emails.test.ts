/**
 * @module
 * The order confirmation email and the invoice document. Both render MONEY and a line per item,
 * making them the two places where a formatting slip is read as a billing error by the person
 * least able to check it. `orderTotal` itself is covered by `totals.property.test.ts`; here it's
 * only asserted that this builder USES it rather than recomputing a second, drifting answer.
 */
import {
    orderConfirmEmail,
    invoiceDocument,
    type OrderLines,
    type InvoiceOrder,
    type InvoiceVatBlock
} from '@modules/orders/emails';
import { orderTotal, orderTaxBreakdown } from '@modules/orders/domain';
import { frontendLink } from '@infrastructure/http/frontend-link';

const NAME = 'Ada Lovelace';
const ORDER_ID = 'order-1';

/**
 * Two lines with different titles, quantities and prices, so no field can stand in for another.
 * Typed `InvoiceOrder` (a `taxRate` on each line) rather than the looser `OrderLines`, since this
 * fixture is reused by both the confirmation-email tests below and the invoice tests further down.
 */
const ORDER: InvoiceOrder = {
    items: [
        { quantity: 2, product: { title: 'Grain-Free Dog Food', price: 100, taxRate: 0.22 } },
        { quantity: 3, product: { title: 'Memory Foam Dog Bed', price: 7.5, taxRate: 0.22 } }
    ],
    shippingCost: 4.25
};

describe('orderConfirmEmail', () => {
    it('names the order-confirmation template', () => {
        expect(orderConfirmEmail('en', NAME, ORDER, ORDER_ID).template).toBe(
            'orders.order-confirm'
        );
    });

    it('renders one line per item, and only for the items on the order', () => {
        // The count is the assertion an "email was sent" check cannot make: a builder mapping the
        // wrong array confirms the wrong number of things and still sends successfully.
        const { data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);

        expect(data.lines).toHaveLength(ORDER.items.length);
    });

    it('puts each item"s own title, quantity and price on its own line', () => {
        // Distinct values per field per line, so a builder that swapped `quantity` for `price`,
        // or reused the first item for both lines, cannot pass.
        const lines = orderConfirmEmail('en', NAME, ORDER, ORDER_ID).data.lines as string[];

        expect(lines[0]).toContain('Grain-Free Dog Food');
        expect(lines[0]).toContain('2');
        expect(lines[0]).toContain('100');
        expect(lines[1]).toContain('Memory Foam Dog Bed');
        expect(lines[1]).toContain('3');
        expect(lines[1]).toContain('7.5');
    });

    it('states the same total the order itself computes, shipping included', () => {
        // Not a recomputation: the point is that this builder defers to `orderTotal`, so the
        // email and the charge cannot drift apart. `totals.property.test.ts` covers the sum.
        const { data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);

        expect(data.total).toContain(String(orderTotal(ORDER)));
    });

    it('includes the shipping cost in that total rather than quoting the goods alone', () => {
        // The specific drift worth naming: an email that quotes the basket subtotal while the
        // card is charged the delivered total.
        const withShipping = orderConfirmEmail('en', NAME, ORDER, ORDER_ID).data.total;
        const withoutShipping = orderConfirmEmail(
            'en',
            NAME,
            { ...ORDER, shippingCost: 0 },
            ORDER_ID
        ).data.total;

        expect(withShipping).not.toBe(withoutShipping);
    });

    it('greets the customer by name', () => {
        const greeting = orderConfirmEmail('en', NAME, ORDER, ORDER_ID).data.greeting as string;

        expect(greeting).toContain(NAME);
        expect(greeting).not.toContain('{{');
    });

    it('confirms an empty order without inventing a line', () => {
        // Not reachable through checkout, but reachable through an admin-created order — and a
        // builder that indexed `items[0]` rather than mapping would throw here rather than in a
        // test.
        const { data } = orderConfirmEmail('en', NAME, { items: [] }, ORDER_ID);

        expect(data.lines).toEqual([]);
    });

    it('carries the locale through and translates by it', () => {
        const english = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);
        const italian = orderConfirmEmail('it', NAME, ORDER, ORDER_ID);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.subject).not.toBe(english.subject);
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);

        for (const value of [subject, data.pageMetaTitle, data.body, data.footer, data.linkLabel]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^orders\./);
        }
        expect(data.pageMetaLinks).toEqual([]);
    });

    /*
     * The link is what lets a customer reach the order's page and its invoice download button —
     * the email sends immediately and always links to the same place, whether or not the customer
     * has visited it yet. `frontendLink` itself is covered by its own unit suite
     * (`tests/unit/infrastructure/http/frontend-link.test.ts`); what this builder owns is passing
     * the order's own id and the recipient's own locale through unchanged.
     */
    it('links to the order, on the paired frontend, carrying its id and locale', () => {
        const { data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);

        expect(data.linkUrl).toBe(frontendLink('order', { locale: 'en', id: ORDER_ID }));
    });

    /*
     * The Phase 6 regression: a line's own product text is frozen upstream, at order-creation
     * time (`resolveSnapshotProducts`) — this builder only INTERPOLATES `item.product.title`,
     * never re-resolves it. A title that happens to collide with a real translation key is the
     * sharpest proof: if this ever regressed to `t(item.product.title)`, the key would resolve
     * to that OTHER string instead of surviving verbatim.
     */
    it("never re-resolves a line's title through `t()`, even one that collides with a real key", () => {
        const collidingTitle = 'orders.email-confirm.greeting';
        const order: OrderLines = {
            items: [{ quantity: 1, product: { title: collidingTitle, price: 1 } }]
        };

        const english = orderConfirmEmail('en', NAME, order, ORDER_ID).data.lines as string[];
        const italian = orderConfirmEmail('it', NAME, order, ORDER_ID).data.lines as string[];

        expect(english[0]).toContain(collidingTitle);
        expect(italian[0]).toContain(collidingTitle);
    });
});

describe('invoiceDocument', () => {
    it('renders one line per item, with each item"s own values', () => {
        const lines = invoiceDocument('en', { ...ORDER, id: 'abc123' }).lines as string[];

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('Grain-Free Dog Food');
        expect(lines[1]).toContain('Memory Foam Dog Bed');
    });

    it('names the order in its title metadata', () => {
        // The invoice is a document a customer keeps and a support agent is asked about; it has
        // to say which order it is for.
        const meta = invoiceDocument('en', { ...ORDER, id: 'abc123' }).pageMetaTitle as string;

        expect(meta).toContain('abc123');
    });

    it('renders an id that is not a string without emitting [object Object]', () => {
        // `id` is `unknown` because an order's id arrives as an ObjectId here as often as a
        // string. `String(...)` is what makes that safe, and dropping it is invisible until a
        // customer receives an invoice titled `[object Object]`.
        const meta = invoiceDocument('en', {
            ...ORDER,
            id: { toString: () => '65dc8a99604c307b702b5ccc' }
        }).pageMetaTitle as string;

        expect(meta).toContain('65dc8a99604c307b702b5ccc');
        expect(meta).not.toContain('[object Object]');
    });

    it('carries the locale and translates by it', () => {
        const english = invoiceDocument('en', { ...ORDER, id: 'x' });
        const italian = invoiceDocument('it', { ...ORDER, id: 'x' });

        expect(english.locale).toBe('en');
        expect(italian.locale).toBe('it');
        expect(italian.title).not.toBe(english.title);
    });

    it("never re-resolves a line's title through `t()`, even one that collides with a real key", () => {
        const collidingTitle = 'orders.invoice.title';
        const order = {
            items: [{ quantity: 1, product: { title: collidingTitle, price: 1, taxRate: 0.22 } }],
            id: 'x'
        };

        const english = invoiceDocument('en', order).lines as string[];
        const italian = invoiceDocument('it', order).lines as string[];

        expect(english[0]).toContain(collidingTitle);
        expect(italian[0]).toContain(collidingTitle);
    });
});

/** A single-line, single-rate order for the VAT-block tests — anything simpler risks masking a bug. */
const VAT_ORDER = {
    items: [{ quantity: 5, product: { title: 'Widget', price: 19.99, taxRate: 0.22 } }],
    id: 'vat-order-1'
};

/** Matches `shopCurrency()`'s default (`.env-example`'s `NODE_DEFAULT_CURRENCY`, unset here). */
const eur = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' });

describe('invoiceDocument — the VAT block', () => {
    it('computes grossAmount from netAmount + taxAmount, never from a float multiply of price × quantity', () => {
        // 19.99 × 5 is 99.94999999999999 in IEEE 754, not 99.95 —
        // if this ever re-derives from the price again instead of the already-reconciled pair
        // beside it, a rate where that drift survives rounding would print a wrong total.
        const vat = invoiceDocument('en', VAT_ORDER).vat as InvoiceVatBlock;
        const breakdown = orderTaxBreakdown(VAT_ORDER);

        expect(vat.rows[0].grossAmount).toBe(
            eur.format(breakdown.lines[0].netAmount + breakdown.lines[0].taxAmount)
        );
    });

    it('formats every amount through Intl.NumberFormat, not a raw number', () => {
        const vat = invoiceDocument('en', VAT_ORDER).vat as InvoiceVatBlock;

        for (const value of [
            vat.rows[0].unitPrice,
            vat.rows[0].netAmount,
            vat.rows[0].taxAmount,
            vat.rows[0].grossAmount,
            vat.netTotal,
            vat.taxTotal,
            vat.grandTotal
        ])
            expect(typeof value).toBe('string');
    });

    it('prints the grand total as the amount actually paid — every line plus shipping', () => {
        const withShipping = { ...VAT_ORDER, shippingCost: 4.5 };
        const vat = invoiceDocument('en', withShipping).vat as InvoiceVatBlock;

        expect(vat.grandTotal).toBe(eur.format(orderTotal(withShipping)));
    });

    it('has no shipping table when the order chose no delivery method', () => {
        const vat = invoiceDocument('en', VAT_ORDER).vat as InvoiceVatBlock;

        expect(vat.shipping).toBeUndefined();
    });

    it('has one shipping row per rate shipping was apportioned to and taxed at', () => {
        const order = {
            items: [
                { quantity: 1, product: { title: 'A', price: 10, taxRate: 0.22 } },
                { quantity: 1, product: { title: 'B', price: 10, taxRate: 0.1 } }
            ],
            shippingCost: 10,
            id: 'x'
        };
        const vat = invoiceDocument('en', order).vat as InvoiceVatBlock;

        expect(vat.shipping?.rows).toHaveLength(2);
        expect(vat.shipping?.rows.map((row) => row.taxRateLabel).toSorted()).toEqual([
            '10%',
            '22%'
        ]);
    });

    it('has one summary row per distinct rate, combining goods and shipping', () => {
        const order = {
            items: [
                { quantity: 1, product: { title: 'A', price: 10, taxRate: 0.22 } },
                { quantity: 1, product: { title: 'B', price: 10, taxRate: 0.22 } }
            ],
            id: 'x'
        };
        const vat = invoiceDocument('en', order).vat as InvoiceVatBlock;

        // Two lines at the SAME rate merge into one summary row, unlike the per-line table above.
        expect(vat.summaryRows).toHaveLength(1);
    });
});
