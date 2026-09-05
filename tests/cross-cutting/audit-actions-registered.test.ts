/**
 * @module
 * Confirms each module's audit vocabulary actually reaches the app-wide `AuditAction` union
 * through its `audit.ts`'s `declare module` augmentation. Drop one and the owning module still
 * compiles alone, but `emitAuditEvent` rejects every action it owns, at the call sites rather than
 * here — checked at type-check time only, since jest itself does not type-check this line.
 *
 * Needs a real static import per module, unlike the structural sweep in `audit-actions.test.ts`:
 * TypeScript can only narrow a literal against the union at compile time when the import is typed,
 * so this file names every auditing module on purpose rather than discovering them off disk.
 */
import type { AuditAction } from '@infrastructure/observability/audit';
import { accountAuditActions } from '@modules/account/audit';
import { cartAuditActions } from '@modules/cart/audit';
import { feedbackAuditActions } from '@modules/feedback/audit';
import { localeAuditActions } from '@modules/locales/audit';
import { ordersAuditActions } from '@modules/orders/audit';
import { productsAuditActions } from '@modules/products/audit';
import { usersAuditActions } from '@modules/users/audit';

/**
 * One representative action per module, paired with its expected wire value — proving membership
 * needs only one action per module, not every one it owns.
 */
const REGISTERED: [module: string, action: AuditAction, expected: string][] = [
    ['account', accountAuditActions.AUTH_LOGIN, 'auth.login'],
    ['cart', cartAuditActions.USER_CART_ITEM_REMOVED, 'user.cart.item_removed'],
    ['feedback', feedbackAuditActions.ADMIN_FEEDBACK_VIEWED, 'admin.feedback.viewed'],
    ['locales', localeAuditActions.ADMIN_LOCALE_ENTRY_IMPORTED, 'admin.locale_entry.imported'],
    ['orders', ordersAuditActions.ORDER_CREATED, 'order.created'],
    ['products', productsAuditActions.ADMIN_PRODUCT_CREATED, 'admin.product.created'],
    ['users', usersAuditActions.ADMIN_USER_CREATED, 'admin.user.created']
];

describe('audit actions register in the app-wide union', () => {
    it.each(REGISTERED)('%s', (_module, action, expected) => {
        expect(action).toBe(expected);
    });
});
