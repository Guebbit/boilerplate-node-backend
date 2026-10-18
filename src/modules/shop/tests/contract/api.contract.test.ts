/**
 * @module
 * Contract tests for `GET /shop`: public, answers the seller's identity, the currency, the
 * ship-to countries and the return address — and nothing that is an operator's own business.
 */

import '@tests/contract';
import { api } from '@tests/http';
import { withEnvironmentOverrides } from '@tests/environment';

describe('GET /shop', () => {
    it('answers the seller, the currency, where it ships and where returns go, with no credential', async () => {
        const response = await api().get('/shop');

        expect(response.status).toBe(200);
        // `tests/support/setup-environment.ts` sets the identity; the rest are defaults.
        expect(response.body.data).toEqual({
            legalName: 'Guebbit Demo Shop Srl',
            street: 'Via Roma 1',
            city: 'Milano',
            zip: '20100',
            country: 'IT',
            email: 'shop@example.com',
            phone: '+39 02 1234567',
            currency: 'EUR',
            shipToCountries: ['IT'],
            returnAddress: {
                name: 'Guebbit Demo Shop Srl',
                street: 'Via Roma 1',
                city: 'Milano',
                zip: '20100',
                country: 'IT'
            },
            returnPostagePayer: 'consumer'
        });
    });

    it('reports the configured currency, ship-to list, VAT number and postage payer', () =>
        withEnvironmentOverrides(
            {
                NODE_DEFAULT_CURRENCY: 'JPY',
                NODE_SHIP_TO_COUNTRIES: 'it,fr',
                NODE_SHOP_VAT_NUMBER: 'IT12345678901',
                NODE_RETURN_POSTAGE_PAYER: 'shop'
            },
            async () => {
                const response = await api().get('/shop');

                expect(response.body.data).toMatchObject({
                    currency: 'JPY',
                    shipToCountries: ['IT', 'FR'],
                    vatNumber: 'IT12345678901',
                    returnPostagePayer: 'shop'
                });
            }
        ));

    it('never publishes the shop time zone', async () => {
        const response = await api().get('/shop');

        expect(JSON.stringify(response.body)).not.toContain('Europe/Rome');
    });

    it('leaves the VAT number out when the shop has none', () =>
        withEnvironmentOverrides({ NODE_SHOP_VAT_NUMBER: '' }, async () => {
            const response = await api().get('/shop');

            expect(response.body.data).not.toHaveProperty('vatNumber');
        }));

    it('reports the trade register and the registration number when the shop has them', () =>
        withEnvironmentOverrides(
            {
                NODE_SHOP_TRADE_REGISTER: 'Registro Imprese di Bologna',
                NODE_SHOP_REGISTRATION_NUMBER: 'BO-123456'
            },
            async () => {
                const response = await api().get('/shop');

                expect(response.body.data).toMatchObject({
                    tradeRegister: 'Registro Imprese di Bologna',
                    registrationNumber: 'BO-123456'
                });
            }
        ));

    it('leaves the trade register and the registration number out when the shop has none', () =>
        withEnvironmentOverrides(
            { NODE_SHOP_TRADE_REGISTER: '', NODE_SHOP_REGISTRATION_NUMBER: '' },
            async () => {
                const response = await api().get('/shop');

                expect(response.body.data).not.toHaveProperty('tradeRegister');
                expect(response.body.data).not.toHaveProperty('registrationNumber');
            }
        ));
});
