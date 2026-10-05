/**
 * @module
 * Merge — a cart built while signed out, folded into the signed-in cart in one call.
 *
 * Lives in cart, not in the browser, for two reasons: a line the catalogue refuses has to become
 * a notification that stays until the user deletes it (`notifications` listens for
 * `cart.merge_refused`), and the answer — what each line became, and whether it is short — needs
 * the stock read and the cart's own cap in one place. A browser-side loop of `POST /cart` calls
 * could do neither.
 *
 * See: docs/modules/cart.md#merging-a-guest-cart
 */

import { emitDomainEvent } from '@kernel/events';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { productService } from '@modules/products';
import type { CallerContext, AddCartItemRequest, MergeLineResult } from '@types';
import { cartAnalyticsEvents } from '../analytics';
import { fitsStock, planMergeLine } from '../domain';
import { CART_MERGE_REFUSED } from '../events';
import type { CartDocument } from '../model';
import { cartLineMax } from '../config';
import { cartRepository, QUANTITY_LIMIT } from '../repository';
import { cartGetForBadge } from './items';
import { readShelf, sellableUnits, type Shelf } from './shelf';
import type { CartView } from './view';

/** What a merge answers with: the cart as it now stands, and what became of each guest line. */
export interface MergeResult {
    cart: CartView;
    lines: MergeLineResult[];
}

/** One line's outcome, and the cart document as the line left it — the next line's starting point. */
interface MergeStep {
    result: MergeLineResult;
    cart: CartDocument | null;
}

/** What `cart` holds of a product; zero for a cart that does not exist yet or has no such line. */
const heldIn = (cart: CartDocument | null, productId: string): number =>
    cart?.items.find((item) => String(item.productId) === productId)?.quantity ?? 0;

/** Whether the catalogue shows the product publicly — the same test `findPublicById` applies. */
const isListed = (shelf: Shelf): boolean => sellableUnits(shelf) !== null;

/**
 * A line the cart took: the analytics event `POST /cart` would have fired for it. `created` is
 * the repository's word for "a new line", which is what tells added from updated.
 */
const trackAdd = (
    context: CallerContext,
    productId: string,
    quantity: number,
    created: boolean
): void =>
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: created
            ? cartAnalyticsEvents.CART_ITEM_ADDED
            : cartAnalyticsEvents.CART_ITEM_UPDATED,
        properties: { product_id: productId, quantity }
    });

/**
 * Write what the rule decided. The cart's own conditional write is the cap's real guard, so a
 * `QUANTITY_LIMIT` here means a concurrent add used the room since the rule looked: nothing was
 * written, and the cart is re-read so `resulting` still says what it holds.
 */
const writeAdd = (
    userId: string,
    productId: string,
    quantity: number,
    context: CallerContext
): Promise<{ cart: CartDocument | null; raced: boolean }> =>
    cartRepository.upsertLine(userId, productId, quantity, 'add').then((write) => {
        if (write === QUANTITY_LIMIT)
            return cartRepository.findByUserId(userId).then((cart) => ({ cart, raced: true }));
        trackAdd(context, productId, quantity, write.created);
        return { cart: write.cart, raced: false };
    });

/**
 * One guest line: ask the rule, write what it allows, read `resulting` off the cart that came
 * back. `requested` is always the guest's number, and `resulting` always the cart's — so the two
 * stay truthful whatever the reason says. Stock only sets `insufficientStock`; it never changes
 * what is added.
 */
const mergeLine = (
    userId: string,
    { productId, quantity }: AddCartItemRequest,
    shelf: Shelf,
    cart: CartDocument | null,
    context: CallerContext
): Promise<MergeStep> => {
    const held = heldIn(cart, productId);
    const plan = planMergeLine({
        requested: quantity,
        held,
        listed: isListed(shelf),
        lineMax: cartLineMax()
    });

    const written =
        plan.add > 0
            ? writeAdd(userId, productId, plan.add, context)
            : Promise.resolve({ cart, raced: false });
    return written.then(({ cart: after, raced }) => {
        // A lost race at the cap is `capped` whatever the rule predicted: the line was not
        // grown, so `summed` would claim a sum the cart does not hold.
        const reason = raced ? 'capped' : plan.reason;
        const resulting = heldIn(after, productId);
        return {
            cart: after,
            result: {
                productId,
                requested: quantity,
                resulting,
                ...(reason ? { reason } : {}),
                // The shared stock rule, on what the cart now holds: the flag, never the number.
                insufficientStock: !fitsStock(resulting, sellableUnits(shelf))
            }
        };
    });
};

/**
 * Merge every guest line through {@link mergeLine} — one at a time, in request order, because each
 * add reads and rewrites the same cart document (see `./reorder`'s `addLinesToCart`), and a
 * product listed twice must see its first line's result. One bad line is a result, never a throw:
 * it must not strand the rest.
 */
const mergeLines = async (
    userId: string,
    lines: AddCartItemRequest[],
    context: CallerContext
): Promise<MergeLineResult[]> => {
    // One read of every product and of the ledger for the whole request, not one per line.
    const shelves = await readShelf(lines.map(({ productId }) => productId));
    let cart = await cartRepository.findByUserId(userId);
    const results: MergeLineResult[] = [];
    for (const line of lines) {
        const step = await mergeLine(
            userId,
            line,
            shelves.get(line.productId) ?? { product: null, available: undefined },
            cart,
            context
        );
        cart = step.cart;
        results.push(step.result);
    }
    return results;
};

/**
 * Announce the lines that could not be added at all (products the catalogue does not show), each with the product's
 * names — such a product may be gone by the time anyone reads the message, so the names are copied in now.
 * `titlesById` answers an empty map for one that no longer exists, which the reader sees as "a
 * product that is no longer available". Says nothing when there is no such line: a changed
 * quantity is the answer's to show, not the inbox's.
 */
const announceUnavailable = (userId: string, results: MergeLineResult[]): Promise<unknown> => {
    const unavailable = results.filter(({ reason }) => reason === 'unavailable');
    if (unavailable.length === 0) return Promise.resolve();

    return Promise.all(
        unavailable.map(({ productId, requested }) =>
            productService
                .titlesById(productId)
                .then((titles) => ({ productId, requested, titles }))
        )
    ).then((lines) => emitDomainEvent(CART_MERGE_REFUSED, { userId, lines }));
};

/**
 * `POST /cart/merge`. Quantities add up exactly as `POST /cart` would — a product in both carts
 * ends at the sum, capped at the line maximum — and only a product the catalogue does not show is
 * refused. Stock lowers nothing: a short line keeps its quantity and comes back flagged
 * `insufficientStock`, read from the stock ledger. Lowering a short line would let a caller read
 * exact stock by merging 999 (docs/theory/defences/authorization.md, "Reading the shelf"). Checkout stays the one real stock gate.
 *
 * @param userId - the signed-in caller
 * @param lines - the guest cart's lines
 * @param context - the caller, for analytics
 * @returns the cart, and one result per submitted line in request order
 */
export const cartMerge = (
    userId: string,
    lines: AddCartItemRequest[],
    context: CallerContext
): Promise<MergeResult> =>
    mergeLines(userId, lines, context).then((results) =>
        announceUnavailable(userId, results).then(() =>
            cartGetForBadge(userId).then((cart) => ({ cart, lines: results }))
        )
    );
