/**
 * @module
 * The wire form of the stock counters: a stored `null` cap is the absent key, never `null`.
 */

import { presentInventoryLevel, presentPreorderLevel } from '../../presenter';

/** The counters of one preorder row, with the cap the test names. */
const row = (backorderLimit: number | null) => ({
    productId: 'p1',
    backorderLimit,
    backordered: 4,
    ordered: 4,
    held: 1,
    paid: 3
});

describe('presentInventoryLevel', () => {
    const level = { productId: 'p1', onHand: 5, reserved: 1, available: 4, backordered: 0 };

    it('says the cap when there is one, `0` included', () => {
        expect(presentInventoryLevel({ ...level, backorderLimit: 0 }, 'T').backorderLimit).toBe(0);
    });

    it('leaves the cap out when there is none', () => {
        expect(presentInventoryLevel({ ...level, backorderLimit: null }, 'T')).not.toHaveProperty(
            'backorderLimit'
        );
    });
});

describe('presentPreorderLevel', () => {
    it('counts the room under a cap', () => {
        const level = presentPreorderLevel(row(10), { title: 'T', sellsAgainstCap: true });

        expect(level).toMatchObject({ backorderLimit: 10, left: 6 });
    });

    it('leaves both the cap and `left` out when there is no cap', () => {
        const level = presentPreorderLevel(row(null), { title: 'T', sellsAgainstCap: true });

        expect(level).not.toHaveProperty('backorderLimit');
        expect(level).not.toHaveProperty('left');
    });

    it('leaves `left` out when the cap promises nothing', () => {
        const level = presentPreorderLevel(row(10), { title: 'T', sellsAgainstCap: false });

        expect(level).not.toHaveProperty('left');
    });
});
