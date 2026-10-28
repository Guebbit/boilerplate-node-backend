/**
 * The path of a product's page: the one setting the sitemap and the back-in-stock mail both read.
 */
import { withEnvironmentOverrides } from '@tests/environment';
import { productPagePath } from '../../config';

describe('productPagePath', () => {
    it('fills the id into the default template', () => {
        expect(productPagePath('65f0abc')).toBe('products/65f0abc');
    });

    it('follows NODE_FRONTEND_LINK_PRODUCT', () =>
        withEnvironmentOverrides({ NODE_FRONTEND_LINK_PRODUCT: 'shop/item-{id}' }, () => {
            expect(productPagePath('65f0abc')).toBe('shop/item-65f0abc');
            return Promise.resolve();
        }));

    it('encodes an id, and reads `$&` in it as text', () => {
        expect(productPagePath('a/b$&c')).toBe('products/a%2Fb%24%26c');
    });
});
