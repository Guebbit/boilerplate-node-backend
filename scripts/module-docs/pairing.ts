/**
 * Which module in the paired frontend answers each module here — and, where none does, why.
 *
 * Eleven of thirteen domains exist on both sides under the same name, and the interesting two do
 * not: `audit-logs` and `observability` are both read by one frontend module, and the frontend has
 * three modules with no backend counterpart at all. That asymmetry is real architecture, and until
 * this file it was written down nowhere in either repository.
 *
 * Stated rather than derived: a name matcher would call `audit-logs` unpaired, which is exactly
 * the wrong answer. `npm run check:module-docs` fails when an enabled module is missing an entry,
 * so the gap cannot widen quietly.
 *
 * See: docs/modules/index.md#the-two-repositories
 */

/** One module's counterpart in `boilerplate-vue-frontend`. */
interface Pairing {
    /** Frontend module names that cover this domain. Empty means nothing over there does. */
    counterparts: readonly string[];

    /** Required when the names differ or the list is empty. One sentence, present tense. */
    why?: string;
}

export const FRONTEND_PAIRING: Readonly<Partial<Record<string, Pairing>>> = {
    account: { counterparts: ['account'] },
    'audit-logs': {
        counterparts: ['admin'],
        why: 'This module owns the trail and no URL; the endpoint that reads it belongs to `observability`, and the screen that renders it is the frontend’s admin dashboard.'
    },
    cart: { counterparts: ['cart'] },
    delivery: { counterparts: ['delivery'] },
    feedback: { counterparts: ['feedback'] },
    inventory: { counterparts: ['inventory'] },
    locales: { counterparts: ['locales'] },
    observability: {
        counterparts: ['admin', 'realtime'],
        why: 'Its two surfaces are consumed by two different frontend modules: the health and metrics reads by `admin`, the SSE stream by `realtime`.'
    },
    orders: { counterparts: ['orders'] },
    payments: { counterparts: ['payments'] },
    products: { counterparts: ['products'] },
    users: { counterparts: ['users'] },
    wishlist: { counterparts: ['wishlist'] }
};

/** Frontend modules with no backend module at all, and what they pair with instead. */
export const FRONTEND_ONLY: Readonly<Record<string, string>> = {
    demo: 'A client-side showcase of the shared UI kit. It pairs with the demo profile and the seeded dataset rather than with any single domain.'
};
