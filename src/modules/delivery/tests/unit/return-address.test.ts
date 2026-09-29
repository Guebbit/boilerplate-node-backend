/**
 * @module
 * The return address — where goods are posted back. All-or-nothing: a customer told to send a
 * parcel to half an address is worse off than one told nothing yet.
 */
import { withEnvironment } from '@tests/environment';
import { returnAddress } from '../../config';
import { cheapestStandardShipping } from '../../domain';

describe('returnAddress', () => {
    it('is absent until configured', () => {
        expect(returnAddress()).toBeUndefined();
    });

    it('is the configured address, country upper-cased', async () => {
        await withEnvironment('NODE_RETURN_ADDRESS_STREET', 'Via Roma 1', () =>
            withEnvironment('NODE_RETURN_ADDRESS_CITY', 'Milano', () =>
                withEnvironment('NODE_RETURN_ADDRESS_ZIP', '20100', () =>
                    withEnvironment('NODE_RETURN_ADDRESS_COUNTRY', 'it', () => {
                        expect(returnAddress()).toEqual({
                            street: 'Via Roma 1',
                            city: 'Milano',
                            zip: '20100',
                            country: 'IT'
                        });
                        return Promise.resolve();
                    })
                )
            )
        );
    });

    it('is absent when only part of it is set', () =>
        withEnvironment('NODE_RETURN_ADDRESS_STREET', 'Via Roma 1', () => {
            expect(returnAddress()).toBeUndefined();
            return Promise.resolve();
        }));
});

describe('cheapestStandardShipping', () => {
    it('is the flat standard rate on a small order — pickup is collection, not delivery', () => {
        expect(cheapestStandardShipping(50)).toBe(5);
    });

    it('is zero once standard is free', () => {
        expect(cheapestStandardShipping(100)).toBe(0);
        expect(cheapestStandardShipping(150)).toBe(0);
    });
});
