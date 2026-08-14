/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * `user.` rather than `admin.`: this is the one action here a customer performs on their own cart.
 * It is audited because a line vanishing from a cart is a support question with a money answer —
 * the customer says they added it, and this is the record that settles whether they did.
 */

export const cartAuditActions = {
    USER_CART_ITEM_REMOVED: 'user.cart.item_removed',
    /* A whole order's lines re-entering the cart at once — the support question this answers is
     * "why is my cart suddenly full", and the metadata names the order that did it. */
    USER_CART_REORDERED: 'user.cart.reordered'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        cart: (typeof cartAuditActions)[keyof typeof cartAuditActions];
    }
}
