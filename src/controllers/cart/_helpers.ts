import UserService from '@services/users';
import type { IUserDocument } from '@models/users';

/**
 * Helper: build a cart response payload from a user document.
 * Populates cart and computes the summary.
 */
export const buildCartResponse = async (user: IUserDocument) => {
    const items = await UserService.cartGet(user);
    let totalQuantity = 0;
    let total = 0;
    for (const item of items) {
        totalQuantity += item.quantity;
        const product = item.product as unknown as { price?: number };
        total += (product?.price ?? 0) * item.quantity;
    }
    const summary = {
        itemsCount: items.length,
        totalQuantity,
        total,
    };
    return { items, summary };
};
