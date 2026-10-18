/**
 * @module
 * The payments mails. Money is what they print, so a formatting slip reads as a billing
 * error to the person least able to check it.
 */
import { orderTotal, orderFrontendLink } from '@modules/orders';
import {
    paymentReceivedEmail,
    refundIssuedEmail,
    transferExpiredEmail,
    transferInstructionsEmail
} from '@modules/payments/emails';

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

        expect(orderTotal(ORDER)).toBe(226.75);
        expect(mail.data.total).toContain('€226.75');
        expect((mail.data.lines as string[])[1]).toContain('€7.50');
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

describe('the bank transfer mails', () => {
    const INSTRUCTIONS = {
        beneficiary: 'Guebbit Shop',
        iban: 'DE89 3704 0044 0532 0130 00',
        reference: 'RF18'
    };
    const PAY_BY = new Date('2026-10-05T10:30:00.000Z');
    // 1990 yen: no decimals, so a builder that formatted as euros would print `€1,990.00`.
    const YEN = {
        items: [{ quantity: 1, product: { title: 'Dog Bed', price: 1990 } }],
        currency: 'JPY'
    };

    it('names the instructions template, and carries each part of the instructions', () => {
        const mail = transferInstructionsEmail('en', NAME, ORDER, INSTRUCTIONS, PAY_BY, ORDER_ID);

        expect(mail.template).toBe('payments.transfer-instructions');
        expect(mail.data).toMatchObject({
            beneficiary: 'Guebbit Shop',
            iban: 'DE89 3704 0044 0532 0130 00',
            reference: 'RF18',
            linkUrl: orderFrontendLink({ locale: 'en', id: ORDER_ID })
        });
        expect(mail.data.bic).toBeUndefined();
        expect(String(mail.data.deadline)).toContain('October');
    });

    it('prints the deadline on the shop clock and names the zone', () => {
        // 10:30Z in October is 12:30 CEST in Rome: a buyer abroad must not read it as their own.
        const mail = transferInstructionsEmail('en', NAME, ORDER, INSTRUCTIONS, PAY_BY, ORDER_ID);

        expect(String(mail.data.deadline)).toMatch(/12:30\s?PM|12:30/);
        expect(String(mail.data.deadline)).toMatch(/GMT\+2|CEST/);
    });

    it('carries the BIC when one is configured', () => {
        const mail = transferInstructionsEmail(
            'en',
            NAME,
            ORDER,
            { ...INSTRUCTIONS, bic: 'COBADEFFXXX' },
            PAY_BY,
            ORDER_ID
        );

        expect(mail.data.bic).toBe('COBADEFFXXX');
    });

    it('speaks the recipient language and echoes no key', () => {
        const english = transferInstructionsEmail(
            'en',
            NAME,
            ORDER,
            INSTRUCTIONS,
            PAY_BY,
            ORDER_ID
        );
        const italian = transferInstructionsEmail(
            'it',
            NAME,
            ORDER,
            INSTRUCTIONS,
            PAY_BY,
            ORDER_ID
        );

        expect(italian.subject).not.toBe(english.subject);
        for (const mail of [english, italian])
            for (const value of [mail.subject, mail.data.body, mail.data.deadline])
                expect(value).not.toMatch(/^payments\./);
    });

    it.each([
        [
            'the instructions',
            () => transferInstructionsEmail('en', NAME, YEN, INSTRUCTIONS, PAY_BY, ORDER_ID)
        ],
        ['the expiry notice', () => transferExpiredEmail('en', YEN)]
    ])('%s print money in the order"s own currency', (_label, build) => {
        expect(build().data.total).toContain('¥1,990');
    });

    it('names the expiry template', () => {
        expect(transferExpiredEmail('en', ORDER).template).toBe('payments.transfer-expired');
    });
});
