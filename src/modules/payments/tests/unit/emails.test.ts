/**
 * @module
 * The two payments mails. Money is what they print, so a formatting slip reads as a billing
 * error to the person least able to check it.
 */
import { orderTotal, orderFrontendLink } from '@modules/orders';
import { paymentReceivedEmail, refundIssuedEmail } from '@modules/payments/emails';

const NAME = 'Ada Lovelace';
const ORDER_ID = 'order-1';

/** Two lines with different titles, quantities and prices, so no field can stand in for another. */
const ORDER = {
    items: [
        { quantity: 2, product: { title: 'Grain-Free Dog Food', price: 100 } },
        { quantity: 3, product: { title: 'Memory Foam Dog Bed', price: 7.5 } }
    ],
    shippingCost: 4.25,
    currency: 'EUR'
};

describe('paymentReceivedEmail', () => {
    it('names the payment-received template and lists one line per item', () => {
        const mail = paymentReceivedEmail('en', NAME, ORDER, ORDER_ID);

        expect(mail.template).toBe('payments.payment-received');
        const lines = mail.data.lines as string[];

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('Grain-Free Dog Food');
    });

    it("quotes the order's own total, shipping included, and links to the order", () => {
        const mail = paymentReceivedEmail('en', NAME, ORDER, ORDER_ID);

        expect(mail.data.total).toContain(String(orderTotal(ORDER)));
        expect(mail.data.linkUrl).toBe(orderFrontendLink({ locale: 'en', id: ORDER_ID }));
    });

    it('translates by the recipient locale and echoes no key', () => {
        const english = paymentReceivedEmail('en', NAME, ORDER, ORDER_ID);
        const italian = paymentReceivedEmail('it', NAME, ORDER, ORDER_ID);

        expect(italian.subject).not.toBe(english.subject);
        expect(english.subject).not.toMatch(/^payments\./);
    });
});

describe('refundIssuedEmail', () => {
    it('names the refunded template, the order and the amount that went back', () => {
        const mail = refundIssuedEmail(
            'en',
            NAME,
            '2026-000041',
            { amount: 12.5, currency: 'EUR' },
            true
        );

        expect(mail.template).toBe('payments.refund-issued');
        expect(mail.data.body).toContain('2026-000041');
        expect(mail.data.body).toContain('12.50');
    });

    it('tells a full refund from a partial one', () => {
        const refund = { amount: 5, currency: 'EUR' };

        const full = refundIssuedEmail('en', NAME, ORDER_ID, refund, true).data.detail;
        const partial = refundIssuedEmail('en', NAME, ORDER_ID, refund, false).data.detail;

        expect(full).not.toBe(partial);
        expect(full).toContain('everything');
        expect(partial).toContain('part');
    });

    it('translates by the recipient locale', () => {
        const refund = { amount: 5, currency: 'EUR' };

        expect(refundIssuedEmail('it', NAME, ORDER_ID, refund, true).subject).not.toBe(
            refundIssuedEmail('en', NAME, ORDER_ID, refund, true).subject
        );
    });
});
