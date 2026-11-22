/**
 * @module
 * Merge — a cart built while signed out, folded into the signed-in cart in one call.
 *
 * Lives in cart, not in the browser, for two reasons: a line that cannot be added has to become
 * a notification that stays until the user deletes it (`notifications` listens for
 * `cart.merge_refused`), and the answer — what each line became, and whether it is short — needs
 * the stock read and the cart's own cap in one place. A browser-side loop of `POST /cart/items` calls
 * could do neither.
 *
 * @see docs/modules/cart.md#merging-a-guest-cart
 */

import { emitDomainEvent } from '@kernel/events';
import { logger } from '@infrastructure/adapters/logger';
import { productService } from '@modules/products';
import type { CallerContext, AddCartItemRequest, CartWarning, MergeLineResult } from '@types';
import { planMergeLine } from '../domain';
import { CART_MERGE_REFUSED } from '../events';
import type { CartDocument } from '../model';
import { cartLineMax, cartMaxLines } from '../config';
import { cartRepository } from '../repository';
import { trackLineWrite } from './items';
import { stockWarning } from './clamp';
import { isListed, readShelf, type Shelf } from './shelf';
import { toCartView } from './view';
import type { CartView } from '../presenter';

/**
 * What a merge answers with: the cart as it now stands, what became of each guest line, and a
 * warning for each line that stock held back.
 */
export interface MergeResult {
    cart: CartView;
    lines: MergeLineResult[];
    warnings?: CartWarning[];
}

/**
 * What {@link mergeLines} settled: the cart as written (or as read, when nothing needed writing),
 * the result per line, the warnings, and the shelves the plan read — kept so a caller that has to
 * name products does not read them again.
 */
export interface MergeOutcome {
    cart: CartDocument | null;
    lines: MergeLineResult[];
    warnings: CartWarning[];
    shelves: Map<string, Shelf>;
}

/** What a plan decided: the whole line list to write, each line's result, and what actually grew. */
interface MergePlanned {
    items: { productId: string; quantity: number }[];
    results: MergeLineResult[];
    warnings: CartWarning[];
    grown: { productId: string; added: number; created: boolean }[];
}

/** A product no read found: the shelf of an id the catalogue never held. */
const NO_SHELF: Shelf = { product: null, quantityAvailable: 0 };

/**
 * Plan every guest line against `cart` in memory, in request order: each line starts from what
 * the lines before it left, so a product listed twice sees its first line's result. Nothing is
 * written here, and one bad line is a result, never a throw: it must not strand the rest.
 *
 * `requested` is always the guest's number and `resulting` always the plan's, so the two stay
 * truthful whatever the reason says. Stock clamps inside the plan, one warning per clamped line.
 */
const planLines = (
    cart: CartDocument | null,
    lines: AddCartItemRequest[],
    shelves: Map<string, Shelf>
): MergePlanned => {
    // Insertion order is the cart's line order: the lines it holds, then new ones as they come.
    const held = new Map(
        (cart?.items ?? []).map((item) => [String(item.productId), item.quantity])
    );
    const results: MergeLineResult[] = [];
    const warnings: CartWarning[] = [];
    const grown: MergePlanned['grown'] = [];

    for (const { productId, quantity } of lines) {
        const shelf = shelves.get(productId) ?? NO_SHELF;
        const before = held.get(productId) ?? 0;
        const plan = planMergeLine({
            requested: quantity,
            held: before,
            listed: isListed(shelf),
            lineMax: cartLineMax(),
            lines: held.size,
            maxLines: cartMaxLines(),
            quantityAvailable: shelf.quantityAvailable
        });

        if (plan.add > 0) {
            held.set(productId, before + plan.add);
            grown.push({ productId, added: plan.add, created: before === 0 });
        }
        const resulting = held.get(productId) ?? 0;
        results.push({
            productId,
            requested: quantity,
            resulting,
            ...(plan.reason ? { reason: plan.reason } : {})
        });
        if (plan.stock)
            warnings.push(
                stockWarning(
                    productId,
                    plan.stock.code,
                    plan.stock.wanted,
                    resulting,
                    shelf.quantityAvailable
                )
            );
    }

    return {
        items: [...held].map(([productId, quantity]) => ({ productId, quantity })),
        results,
        warnings,
        grown
    };
};

/** Plan-and-write attempts before a cart that keeps moving under the merge is given up on. */
const MERGE_ATTEMPTS = 3;

/**
 * Merge every guest line in ONE write. The plan ({@link planLines}) is made against one read of
 * the cart and committed only if the cart is still at that version; a cart that moved is read and
 * planned again. So a failure leaves the cart exactly as it was, and a retry of the same request
 * cannot add a line twice. `./reorder` reuses this for the same reason.
 *
 * Nothing to add (every line removed or refused) writes nothing, and bumps no version.
 *
 * @see docs/modules/cart.md#merging-a-guest-cart
 * @throws {Error} when the cart moved on every one of {@link MERGE_ATTEMPTS} attempts
 */
export const mergeLines = (
    userId: string,
    lines: AddCartItemRequest[],
    context: CallerContext
): Promise<MergeOutcome> => {
    const attempt = (shelves: Map<string, Shelf>, attemptsLeft: number): Promise<MergeOutcome> =>
        cartRepository.findByUserId(userId).then((cart) => {
            const { items, results, warnings, grown } = planLines(cart, lines, shelves);
            if (grown.length === 0) return { cart, lines: results, warnings, shelves };

            return cartRepository
                .replaceLinesIfUnchanged(userId, cart?.__v ?? null, items)
                .then((written) => {
                    if (!written) {
                        if (attemptsLeft <= 1)
                            throw new Error('cart: exhausted retries merging into a moving cart');
                        return attempt(shelves, attemptsLeft - 1);
                    }
                    // After the write: a plan that was thrown away counts nothing.
                    for (const { productId, added, created } of grown)
                        trackLineWrite(context, productId, added, created);
                    return { cart: written, lines: results, warnings, shelves };
                });
        });

    // One read of every product and of the ledger for the whole request, not one per line.
    return readShelf(lines.map(({ productId }) => productId)).then((shelves) =>
        attempt(shelves, MERGE_ATTEMPTS)
    );
};

/**
 * Announce the lines that could not be added at all (products the catalogue does not show, and
 * new ones that found the cart full), each with the product's names — such a product may be gone
 * by the time anyone reads the message, so the names are copied in now. A product that no longer
 * exists has no names to give: an empty map, which the reader sees as "a product that is no longer
 * available". Says nothing when there is no such line: a changed quantity is the answer's to
 * show, not the inbox's.
 *
 * A names lookup that fails is logged and answers the empty map for that line: the notice is
 * a courtesy, so it must never turn a merge that already wrote into a 500.
 */
const announceRemoved = (
    userId: string,
    { lines: results, shelves }: MergeOutcome
): Promise<unknown> => {
    const removed = results.filter(({ reason }) => reason === 'removed' || reason === 'cart_full');
    if (removed.length === 0) return Promise.resolve();

    return Promise.all(
        removed.map(({ productId, requested }) => {
            const product = shelves.get(productId)?.product;
            return (product ? productService.titlesOf(product) : Promise.resolve({}))
                .catch((error: unknown) => {
                    // Stryker disable all
                    logger.error({
                        message: 'Merge notice: the product names could not be read; sent without.',
                        productId,
                        error
                    });
                    // Stryker restore all
                    return {};
                })
                .then((titles) => ({ productId, requested, titles }));
        })
    ).then((lines) => emitDomainEvent(CART_MERGE_REFUSED, { userId, lines }));
};

/**
 * `POST /cart/merge`. Quantities add up exactly as `POST /cart/items` would — a product in both carts
 * ends at the sum, capped at the line maximum — and only a product the catalogue does not show is
 * refused. Stock clamps, as `POST /cart/items` does: a line is added up to what can be bought and
 * each clamped line comes back as a warning. Checkout stays the one real stock gate.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
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
    mergeLines(userId, lines, context).then((outcome) =>
        announceRemoved(userId, outcome)
            // The answer is the cart the write returned, not a second read of it.
            .then(() => toCartView(outcome.cart))
            .then((cart) => ({
                cart,
                lines: outcome.lines,
                ...(outcome.warnings.length > 0 ? { warnings: outcome.warnings } : {})
            }))
    );
