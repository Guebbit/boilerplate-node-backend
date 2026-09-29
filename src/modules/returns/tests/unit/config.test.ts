/**
 * @module
 * Who pays to send the goods back — an env choice with one default, refused when it is neither.
 */
import { withEnvironment } from '@tests/environment';
import { returnPostagePayer } from '../../config';

describe('returnPostagePayer', () => {
    it('is the consumer unless the shop says otherwise — Art. 14(1)’s default', () => {
        expect(returnPostagePayer()).toBe('consumer');
    });

    it('is the shop when a deployment offers free returns', () =>
        withEnvironment('NODE_RETURN_POSTAGE_PAYER', 'shop', () => {
            expect(returnPostagePayer()).toBe('shop');
            return Promise.resolve();
        }));

    it('refuses a value that is neither, rather than guessing who pays', () =>
        withEnvironment('NODE_RETURN_POSTAGE_PAYER', 'nobody', () => {
            expect(() => returnPostagePayer()).toThrow(/NODE_RETURN_POSTAGE_PAYER/);
            return Promise.resolve();
        }));
});
