/**
 * @module
 * The shipment-dispatched email. One builder, and the field that matters is `tracking`: it's the
 * only place the customer is given the code, and a code that renders empty or interpolated wrong
 * turns "your parcel is on its way" into a message with no way to act on it.
 */

import { shipmentShippedEmail } from '@modules/delivery/emails';

const NAME = 'Ada Lovelace';
const CODE = 'TRK-99887766';

describe('shipmentShippedEmail', () => {
    it('names the dispatch template', () => {
        expect(shipmentShippedEmail('en', NAME, CODE).template).toBe('delivery.shipment-shipped');
    });

    it('puts the tracking code in the message', () => {
        // The one actionable fact in the whole email.
        const tracking = shipmentShippedEmail('en', NAME, CODE).data.tracking as string;

        expect(tracking).toContain(CODE);
        expect(tracking).not.toContain('{{');
    });

    it('greets the customer by name', () => {
        expect(shipmentShippedEmail('en', NAME, CODE).data.greeting).toContain(NAME);
    });

    it('resolves every copy slot rather than echoing a key', () => {
        const { subject, data } = shipmentShippedEmail('en', NAME, CODE);

        for (const value of [subject, data.pageMetaTitle, data.body, data.footer]) {
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^delivery\./);
        }
        expect(data.pageMetaLinks).toEqual([]);
    });

    it('carries the locale through and translates by it', () => {
        const english = shipmentShippedEmail('en', NAME, CODE);
        const italian = shipmentShippedEmail('it', NAME, CODE);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.subject).not.toBe(english.subject);
    });
});
