/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * `user.` rather than `admin.`: this is the one action here a customer performs on their own cart.
 * It is audited because a line vanishing from a cart is a support question with a money answer —
 * the customer says they added it, and this is the record that settles whether they did.
 */

export const cartAuditActions = {
    USER_CART_ITEM_REMOVED: 'user.cart.item_removed'
} as const;

declare module '@infrastructure/observability/audit' {
    interface IAuditActionMap {
        cart: (typeof cartAuditActions)[keyof typeof cartAuditActions];
    }
}
