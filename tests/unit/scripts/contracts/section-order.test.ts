import { orderSections } from '../../../../scripts/contracts/section-order';

describe('orderSections', () => {
    const preferred = ['products', 'cart', 'users'];

    it('keeps the preferred order for the sections that exist', () => {
        expect(orderSections(preferred, ['users', 'products', 'cart'])).toEqual([
            'products',
            'cart',
            'users'
        ]);
    });

    it('drops a preferred section whose module was deleted', () => {
        expect(orderSections(preferred, ['users', 'cart'])).toEqual(['cart', 'users']);
    });

    it('appends a module the preference has never heard of, alphabetically', () => {
        expect(orderSections(preferred, ['zeta', 'users', 'alpha'])).toEqual([
            'users',
            'alpha',
            'zeta'
        ]);
    });

    it('is empty when nothing exists', () => {
        expect(orderSections(preferred, [])).toEqual([]);
    });
});
