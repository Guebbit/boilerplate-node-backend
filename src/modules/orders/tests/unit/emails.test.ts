/**
 * @module
 * The order confirmation email. Renders MONEY and a line per item, the place where a formatting
 * slip is read as a billing error by the person least able to check it. `orderTotal` itself is
 * covered by `totals.property.test.ts`; here it's only asserted that this builder USES it rather
 * than recomputing a second, drifting answer.
 *
 * The invoice document itself is `invoicing`'s own — see
 * `src/modules/invoicing/tests/unit/emails.test.ts`.
 */
import { orderConfirmEmail, type OrderLines } from '@modules/orders/emails';
import { orderTotal } from '@modules/orders/domain';
import { orderFrontendLink, orderCurrency } from '@modules/orders/config';

const NAME = 'Ada Lovelace';
const ORDER_ID = 'order-1';

/** Two lines with different titles, quantities and prices, so no field can stand in for another. */
const ORDER: OrderLines = {
    items: [
        { quantity: 2, product: { title: 'Grain-Free Dog Food', price: 100 } },
        { quantity: 3, product: { title: 'Memory Foam Dog Bed', price: 7.5 } }
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

        expect(data.total).toContain(
            String(orderTotal({ ...ORDER, currency: orderCurrency(ORDER) }))
        );
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
     * has visited it yet. `orderFrontendLink`/`frontendLink` are covered by their own unit suites
     * (`src/modules/orders/tests/unit/config.test.ts`,
     * `tests/unit/infrastructure/http/frontend-link.test.ts`); what this builder owns is passing
     * the order's own id and the recipient's own locale through unchanged.
     */
    it('links to the order, on the paired frontend, carrying its id and locale', () => {
        const { data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);

        expect(data.linkUrl).toBe(orderFrontendLink({ locale: 'en', id: ORDER_ID }));
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

    /*
     * SH2 = C: every order this builder mails is still `pending` — the payment either hasn't been
     * asked for yet (`card`) or a `bank_transfer` order gets `bankTransferInstructionsEmail`
     * instead. Nothing here may claim the money already moved.
     */
    it('says the order is received and awaiting payment, never that it is confirmed', () => {
        const { subject, data } = orderConfirmEmail('en', NAME, ORDER, ORDER_ID);
        const body = String(data.body);

        expect(`${subject} ${body}`).toMatch(/awaiting payment/i);
        expect(subject).not.toMatch(/confirmed/i);
        expect(body).not.toMatch(/confirmed/i);
    });
});
