/**
 * @module
 * The `orderNumber` filter on the list, search and CSV export: exact and indexed, tolerant of how a
 * customer types the number, an empty page for a value that cannot be one, bounded by the caller's
 * own read scope. Real Mongo.
 */
import { text } from 'node:stream/consumers';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { orderService } from '../../services';
import { orderModel } from '../../model';

setupTestDb();

/** An order of its own buyer, carrying the number a test pins. */
const orderNumbered = async (orderNumber: string, email: string) => {
    const user = await createUser({ email, username: email.replaceAll(/\W/g, '') });
    const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
        orderNumber
    });
    return { user, id: String(order._id) };
};

/** The ids a staff search by this quoted number answers. */
const found = (orderNumber: string): Promise<string[]> =>
    orderService.search({ orderNumber }, {}).then(({ items }) => items.map(({ id }) => id));

describe('the orderNumber filter', () => {
    it.each(['1999-000041', '#1999-000041', ' 1999-41 ', '#1999-41'])(
        'finds the order when the number is typed as %j',
        async (typed) => {
            const target = await orderNumbered('1999-000041', 'a@example.com');
            await orderNumbered('1999-000042', 'b@example.com');

            expect(await found(typed)).toEqual([target.id]);
        }
    );

    it.each(['nonsense', '41', '1999-', '#'])(
        'answers an empty page, not an error, for %j',
        async (typed) => {
            await orderNumbered('1999-000041', 'a@example.com');

            expect(await found(typed)).toEqual([]);
        }
    );

    it('finds nothing for a well-formed number nobody holds', async () => {
        await orderNumbered('1999-000041', 'a@example.com');

        expect(await found('1999-99')).toEqual([]);
    });

    it('does not let a buyer reach another buyer’s order by its number', async () => {
        const mine = await orderNumbered('1999-000041', 'a@example.com');
        const theirs = await orderNumbered('1999-000042', 'b@example.com');
        const scope = orderService.callerScope(asCustomer(mine.user.id));

        const own = await orderService.search({ orderNumber: '1999-41' }, scope);
        const other = await orderService.search({ orderNumber: '1999-42' }, scope);

        expect(own.items.map(({ id }) => id)).toEqual([mine.id]);
        expect(other.items).toEqual([]);
        expect(theirs.id).not.toBe(mine.id);
    });

    it('narrows the CSV export the same way', async () => {
        await orderNumbered('1999-000041', 'a@example.com');
        await orderNumbered('1999-000042', 'b@example.com');

        const opened = await orderService.openOrderExport(
            { orderNumber: '#1999-42' },
            asAdmin(),
            callerContextAs('admin', 'admin-1')
        );
        if ('success' in opened) throw new Error('export refused');
        const file = await text(opened.source.pipe(opened.csv));

        expect(file).toContain('1999-000042');
        expect(file).not.toContain('1999-000041');
    });
});

describe('the unique index', () => {
    it('refuses a second order with a number already issued', async () => {
        await orderNumbered('1999-000041', 'a@example.com');
        await orderModel.init();

        await expect(orderNumbered('1999-000041', 'b@example.com')).rejects.toMatchObject({
            code: 11_000
        });
    });
});
