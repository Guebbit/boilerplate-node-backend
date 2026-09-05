/**
 * @module
 * The order confirmation email and the invoice document. Both render MONEY and a line per item,
 * making them the two places where a formatting slip is read as a billing error by the person
 * least able to check it. `orderTotal` itself is covered by `totals.property.test.ts`; here it's
 * only asserted that this builder USES it rather than recomputing a second, drifting answer.
 */
import { orderConfirmEmail, invoiceDocument, type OrderLines } from '@modules/orders/emails';
import { orderTotal } from '@modules/orders/domain';

const NAME = 'Ada Lovelace';

/** Two lines with different titles, quantities and prices, so no field can stand in for another. */
const ORDER: OrderLines = {
    items: [
        { quantity: 2, product: { title: 'Sallyno Panino', price: 100 } },
        { quantity: 3, product: { title: 'Pufettino', price: 7.5 } }
    ],
    shippingCost: 4.25
};

describe('orderConfirmEmail', () => {
    it('names the order-confirmation template', () => {
        expect(orderConfirmEmail('en', NAME, ORDER).template).toBe('orders.order-confirm');
    });

    it('renders one line per item, and only for the items on the order', () => {
        // The count is the assertion an "email was sent" check cannot make: a builder mapping the
        // wrong array confirms the wrong number of things and still sends successfully.
        const { data } = orderConfirmEmail('en', NAME, ORDER);

        expect(data.lines).toHaveLength(ORDER.items.length);
    });

    it('puts each item"s own title, quantity and price on its own line', () => {
        // Distinct values per field per line, so a builder that swapped `quantity` for `price`,
        // or reused the first item for both lines, cannot pass.
        const lines = orderConfirmEmail('en', NAME, ORDER).data.lines as string[];

        expect(lines[0]).toContain('Sallyno Panino');
        expect(lines[0]).toContain('2');
        expect(lines[0]).toContain('100');
        expect(lines[1]).toContain('Pufettino');
        expect(lines[1]).toContain('3');
        expect(lines[1]).toContain('7.5');
    });

    it('states the same total the order itself computes, shipping included', () => {
        // Not a recomputation: the point is that this builder defers to `orderTotal`, so the
        // email and the charge cannot drift apart. `totals.property.test.ts` covers the sum.
        const { data } = orderConfirmEmail('en', NAME, ORDER);

        expect(data.total).toContain(String(orderTotal(ORDER)));
    });

    it('includes the shipping cost in that total rather than quoting the goods alone', () => {
        // The specific drift worth naming: an email that quotes the basket subtotal while the
        // card is charged the delivered total.
        const withShipping = orderConfirmEmail('en', NAME, ORDER).data.total;
        const withoutShipping = orderConfirmEmail('en', NAME, { ...ORDER, shippingCost: 0 }).data
            .total;

        expect(withShipping).not.toBe(withoutShipping);
    });

    it('greets the customer by name', () => {
        const greeting = orderConfirmEmail('en', NAME, ORDER).data.greeting as string;

        expect(greeting).toContain(NAME);
        expect(greeting).not.toContain('{{');
    });

    it('confirms an empty order without inventing a line', () => {
        // Not reachable through checkout, but reachable through an admin-created order — and a
        // builder that indexed `items[0]` rather than mapping would throw here rather than in a
        // test.
        const { data } = orderConfirmEmail('en', NAME, { items: [] });

        expect(data.lines).toEqual([]);
    });

    it('carries the locale through and translates by it', () => {
        const english = orderConfirmEmail('en', NAME, ORDER);
        const italian = orderConfirmEmail('it', NAME, ORDER);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.subject).not.toBe(english.subject);
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = orderConfirmEmail('en', NAME, ORDER);

        for (const value of [subject, data.pageMetaTitle, data.body, data.footer]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^orders\./);
        }
        expect(data.pageMetaLinks).toEqual([]);
    });
});

describe('invoiceDocument', () => {
    it('renders one line per item, with each item"s own values', () => {
        const lines = invoiceDocument('en', { ...ORDER, id: 'abc123' }).lines as string[];

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('Sallyno Panino');
        expect(lines[1]).toContain('Pufettino');
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
});
