/**
 * @module
 * The two shipment emails. One builder each, and the fields that matter are the ones the customer
 * acts on: `tracking` is the only place the code is given, `more` says how much is still to come,
 * `withdraw` is the only place the last arrival's deadline is stated. A code that renders empty or
 * interpolated wrong turns "your parcel is on its way" into a message with no way to act on it.
 */

import {
    fulfillmentDelayedEmail,
    shipmentDeliveredEmail,
    shipmentShippedEmail
} from '@modules/delivery/emails';

const NAME = 'Ada Lovelace';
const CODE = 'TRK-99887766';
const LINES = [
    { title: 'Analytical Engine', quantity: 2 },
    { title: 'Punch cards', quantity: 1 }
];

/** A shipment that completes the order, with a tracking code. */
const completing = { lines: LINES, trackingCode: CODE, remainingUnits: 0 };

describe('shipmentShippedEmail', () => {
    it('names the dispatch template', () => {
        expect(shipmentShippedEmail('en', NAME, completing).template).toBe(
            'delivery.shipment-shipped'
        );
    });

    it('puts the tracking code in the message', () => {
        // The one actionable fact in the whole email.
        const tracking = shipmentShippedEmail('en', NAME, completing).data.tracking as string;

        expect(tracking).toContain(CODE);
        expect(tracking).not.toContain('{{');
    });

    it('says the code was corrected, with its own subject, in both languages', () => {
        for (const locale of ['en', 'it']) {
            const first = shipmentShippedEmail(locale, NAME, completing);
            const fixed = shipmentShippedEmail(locale, NAME, { ...completing, corrected: true });

            expect(fixed.subject).not.toBe(first.subject);
            expect(fixed.data.body).not.toBe(first.data.body);
            expect(fixed.data.tracking).toBe(first.data.tracking);
            expect(JSON.stringify(fixed)).not.toMatch(/delivery\.email-shipped|\{\{/);
        }
    });

    it('leaves the tracking line out when the method carries no tracking', () => {
        const { data } = shipmentShippedEmail('en', NAME, {
            ...completing,
            trackingCode: undefined
        });

        expect(data.tracking).toBeUndefined();
    });

    it('lists what is in the shipment, quantity first', () => {
        expect(shipmentShippedEmail('en', NAME, completing).data.lines).toEqual([
            '2 × Analytical Engine',
            '1 × Punch cards'
        ]);
    });

    it('says how many items are still to follow, and only when some are', () => {
        const partial = shipmentShippedEmail('en', NAME, { ...completing, remainingUnits: 3 });

        expect(partial.data.more).toContain('3');
        expect(shipmentShippedEmail('en', NAME, completing).data.more).toBeUndefined();
    });

    it('greets the customer by name', () => {
        expect(shipmentShippedEmail('en', NAME, completing).data.greeting).toContain(NAME);
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = shipmentShippedEmail('en', NAME, {
            ...completing,
            remainingUnits: 1
        });

        for (const value of [subject, data.pageMetaTitle, data.body, data.more, data.footer]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^delivery\./);
        }
    });

    it('carries the locale through and translates by it', () => {
        const english = shipmentShippedEmail('en', NAME, completing);
        const italian = shipmentShippedEmail('it', NAME, completing);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.subject).not.toBe(english.subject);
    });
});

describe('shipmentDeliveredEmail', () => {
    it('names its own template and lists what arrived', () => {
        const mail = shipmentDeliveredEmail('en', NAME, { lines: LINES });

        expect(mail.template).toBe('delivery.shipment-delivered');
        expect(mail.data.lines).toEqual(['2 × Analytical Engine', '1 × Punch cards']);
        expect(mail.data.greeting).toContain(NAME);
    });

    it('states the withdrawal deadline, in the buyer’s language and in UTC, only on the last delivery', () => {
        const withdrawUntil = new Date(Date.UTC(2026, 10, 14, 23, 59, 59, 999));

        const last = shipmentDeliveredEmail('en', NAME, { lines: LINES, withdrawUntil });
        const italian = shipmentDeliveredEmail('it', NAME, { lines: LINES, withdrawUntil });
        const notLast = shipmentDeliveredEmail('en', NAME, { lines: LINES });

        expect(String(last.data.withdraw)).toContain('November 14, 2026');
        expect(String(italian.data.withdraw)).toContain('14 novembre 2026');
        expect(notLast.data.withdraw).toBeUndefined();
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = shipmentDeliveredEmail('en', NAME, { lines: LINES });

        for (const value of [subject, data.pageMetaTitle, data.body, data.footer]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^delivery\./);
        }
    });
});

describe('fulfillmentDelayedEmail', () => {
    const base = {
        titles: ['Analytical Engine'],
        agreedAt: new Date('2026-12-01T00:00:00Z'),
        orderUrl: 'https://shop.example/en/orders/1'
    };

    it("prints the dates on the shop's calendar, so a day staff typed does not slip a day", () => {
        // Local midnight in Rome is 23:00Z the evening before (winter, UTC+1).
        const mail = fulfillmentDelayedEmail('en', NAME, {
            ...base,
            agreedAt: new Date('2026-12-11T23:00:00Z'),
            expectedAt: new Date('2026-12-19T23:00:00Z'),
            reason: 'moved'
        });

        expect(String(mail.data.body)).toContain('December 12, 2026');
        expect(String(mail.data.body)).toContain('December 20, 2026');
    });

    it.each([
        ['en', 'You can cancel it from your order page at any time before it ships'],
        [
            'it',
            'Puoi annullarlo dalla pagina del tuo ordine in qualsiasi momento prima della spedizione'
        ]
    ])(
        'closes every wording the same way: cancel any time, doing nothing keeps waiting (%s)',
        (locale, text) => {
            for (const mail of [
                fulfillmentDelayedEmail(locale, NAME, {
                    ...base,
                    expectedAt: new Date('2026-12-29T00:00:00Z'),
                    reason: 'moved'
                }),
                fulfillmentDelayedEmail(locale, NAME, { ...base, reason: 'moved' }),
                fulfillmentDelayedEmail(locale, NAME, { ...base, reason: 'due' })
            ]) {
                expect(String(mail.data.closing)).toContain(text);
                // Nothing is asked of the buyer: no answer slot, no deadline.
                expect(mail.data).not.toHaveProperty('answer');
            }
        }
    );

    it('names three wordings, one per thing that happened', () => {
        const moved = fulfillmentDelayedEmail('en', NAME, {
            ...base,
            expectedAt: new Date('2026-12-29T00:00:00Z'),
            reason: 'moved'
        });
        const cleared = fulfillmentDelayedEmail('en', NAME, { ...base, reason: 'moved' });
        const passed = fulfillmentDelayedEmail('en', NAME, { ...base, reason: 'due' });

        expect(String(moved.data.body)).toContain('They are now expected on December 29, 2026');
        expect(String(cleared.data.body)).toContain('We do not have a new date for them yet');
        expect(String(passed.data.body)).toContain('the stock we ordered has not reached us yet');
        expect(new Set([moved.subject, cleared.subject, passed.subject]).size).toBe(3);
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = fulfillmentDelayedEmail('it', NAME, { ...base, reason: 'due' });

        for (const value of [subject, data.pageMetaTitle, data.body, data.closing, data.footer]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^delivery\./);
        }
    });
});
