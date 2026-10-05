/**
 * @module
 * `upsertLine`'s retry budget — the bound the repository comment calls "a pathological loop". The
 * contention itself is raced in `tests/integration/concurrency/cart-races.test.ts`; what a race
 * cannot do deterministically is exhaust the budget, so the contended write is forced here by
 * making the cart model's atomic write fail or miss on demand.
 *
 * Invariants:
 *   - a duplicate-key loss is retried, and the retry applies the increment exactly once;
 *   - the loop is bounded at three attempts, and exhausting it throws rather than spinning or
 *     silently dropping the add;
 *   - an exhausted add writes nothing.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asStub } from '@tests/stub';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { cartRepository } from '../../repository';
import { cartModel } from '../../model';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** The attempt budget `upsertLine` starts with. */
const ATTEMPTS = 3;

/** What a driver raises for a lost unique-index race: `code` 11000. */
const duplicateKey = (): Error =>
    Object.assign(new Error('E11000 duplicate key'), { code: 11_000 });

/** A query stub whose `exec()` settles as `settle` says — all `upsertLine` calls on a query. */
const queryThatSettles = (settle: () => Promise<unknown>) =>
    asStub<ReturnType<typeof cartModel.findOneAndUpdate>>({ exec: settle });

/** A shopper whose cart already holds `quantity` of a fresh product. */
const cartWithLine = async (quantity: number) => {
    const user = await createUser();
    const product = await createProduct();
    await cartRepository.upsertLine(user.id, String(product._id), quantity, 'add');
    return { userId: user.id, productId: String(product._id) };
};

/** The quantity a cart holds of one product, and its version. */
const stateOf = (userId: string, productId: string) =>
    cartRepository.findByUserId(userId).then((cart) => ({
        quantity: cart?.items.find((item) => String(item.productId) === productId)?.quantity,
        version: cart?.__v
    }));

describe('upsertLine under a lost unique-index race', () => {
    it('retries a duplicate key and applies the increment exactly once', async () => {
        const { userId, productId } = await cartWithLine(2);
        const before = await stateOf(userId, productId);
        jest.spyOn(cartModel, 'findOneAndUpdate').mockImplementationOnce(() =>
            queryThatSettles(() => Promise.reject(duplicateKey()))
        );

        const written = await cartRepository.upsertLine(userId, productId, 3, 'add');

        expect(written).toMatchObject({ created: false });
        expect(await stateOf(userId, productId)).toEqual({
            quantity: 5,
            version: (before.version ?? 0) + 1
        });
    });

    it('gives up after exactly three attempts, surfacing the duplicate key, writing nothing', async () => {
        const { userId, productId } = await cartWithLine(2);
        const before = await stateOf(userId, productId);
        const attempts = jest
            .spyOn(cartModel, 'findOneAndUpdate')
            .mockImplementation(() => queryThatSettles(() => Promise.reject(duplicateKey())));

        await expect(cartRepository.upsertLine(userId, productId, 3, 'add')).rejects.toMatchObject({
            code: 11_000
        });

        expect(attempts).toHaveBeenCalledTimes(ATTEMPTS);
        expect(await stateOf(userId, productId)).toEqual(before);
    });

    it('does not retry an error that is not a duplicate key', async () => {
        const { userId, productId } = await cartWithLine(2);
        const attempts = jest
            .spyOn(cartModel, 'findOneAndUpdate')
            .mockImplementation(() =>
                queryThatSettles(() => Promise.reject(new Error('connection reset')))
            );

        await expect(cartRepository.upsertLine(userId, productId, 3, 'add')).rejects.toThrow(
            'connection reset'
        );

        expect(attempts).toHaveBeenCalledTimes(1);
    });
});

describe('upsertLine when the atomic add keeps missing a line that has room', () => {
    it('stops after three attempts with an explicit error, writing nothing', async () => {
        // The filter keeps missing (as if another write changed the line each time) while the
        // follow-up read shows room, so every pass decides "retry" until the budget is spent.
        const { userId, productId } = await cartWithLine(2);
        const before = await stateOf(userId, productId);
        const attempts = jest
            .spyOn(cartModel, 'findOneAndUpdate')
            .mockImplementation(() => queryThatSettles(() => Promise.resolve(null)));

        await expect(cartRepository.upsertLine(userId, productId, 3, 'add')).rejects.toThrow(
            'exhausted retries'
        );

        expect(attempts).toHaveBeenCalledTimes(ATTEMPTS);
        expect(await stateOf(userId, productId)).toEqual(before);
    });

    it('converges when the miss clears before the budget runs out', async () => {
        const { userId, productId } = await cartWithLine(2);
        jest.spyOn(cartModel, 'findOneAndUpdate')
            .mockImplementationOnce(() => queryThatSettles(() => Promise.resolve(null)))
            .mockImplementationOnce(() => queryThatSettles(() => Promise.resolve(null)));

        const written = await cartRepository.upsertLine(userId, productId, 3, 'add');

        expect(written).toMatchObject({ created: false });
        const after = await stateOf(userId, productId);
        expect(after.quantity).toBe(5);
    });
});
