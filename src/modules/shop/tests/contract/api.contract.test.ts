/**
 * @module
 * Contract tests for `GET /shop`: public, answers the currency, the ship-to countries, the return
 * address and the time zone — and neither the operator's identity nor the Terms version, which are
 * `GET /config`'s.
 */

import '@tests/contract';
import { api } from '@tests/http';
import { withEnvironmentOverrides } from '@tests/environment';

describe('GET /shop', () => {
    it('answers the currency, where it ships and where returns go, with no credential', async () => {
        const response = await api().get('/shop');

        expect(response.status).toBe(200);
        // `tests/support/setup-environment.ts` sets the operator, whose address is the return fallback.
        expect(response.body).toEqual({
            currency: 'EUR',
            minorUnits: 2,
            shipToCountries: ['IT'],
            returnAddress: {
                name: 'Guebbit Demo Shop Srl',
                street: 'Via Roma 1',
                city: 'Milano',
                zip: '20100',
                country: 'IT'
            },
            returnPostagePayer: 'consumer',
            backorderPromiseDays: 30,
            timeZone: 'Europe/Rome'
        });
    });

    it('reports the configured currency, ship-to list and postage payer', () =>
        withEnvironmentOverrides(
            {
                NODE_DEFAULT_CURRENCY: 'JPY',
                NODE_SHIP_TO_COUNTRIES: 'it,fr',
                NODE_RETURN_POSTAGE_PAYER: 'shop'
            },
            async () => {
                const response = await api().get('/shop');

                expect(response.body).toMatchObject({
                    currency: 'JPY',
                    // JPY has no minor unit: a price input in this shop takes whole yen.
                    minorUnits: 0,
                    shipToCountries: ['IT', 'FR'],
                    returnPostagePayer: 'shop'
                });
            }
        ));

    it('carries no identity and no Terms version: those are GET /config', async () => {
        const response = await api().get('/shop');

        expect(response.body).not.toHaveProperty('legalName');
        expect(response.body).not.toHaveProperty('termsVersion');
    });

    it('publishes the shop time zone, the calendar a promised day belongs to', () =>
        withEnvironmentOverrides({ NODE_SHOP_TIMEZONE: 'Asia/Tokyo' }, async () => {
            const response = await api().get('/shop');

            expect(response.body).toMatchObject({ timeZone: 'Asia/Tokyo' });
        }));
});
