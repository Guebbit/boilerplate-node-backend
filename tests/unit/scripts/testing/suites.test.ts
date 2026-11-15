/**
 * @module
 * `isOutsideLightGate` — which staged files the pre-commit hook runs on top of `complete:light`.
 * A wrong "false" lets a new integration test skip the commit gate; a wrong "true" reruns a
 * file light already ran. Both directions are asserted.
 *
 * See: docs/reference/package-scripts.md
 */

import { isOutsideLightGate } from '../../../../scripts/testing/suites';

describe('isOutsideLightGate', () => {
    it.each([
        'tests/integration/orders/checkout.test.ts',
        'tests/contract/request-contract.test.ts',
        'tests/fuzz/products.test.ts',
        'src/modules/orders/tests/integration/refund.test.ts',
        'src/modules/cart/tests/contract/cart.test.ts'
    ])('picks %s, a layer light leaves out', (path) => {
        expect(isOutsideLightGate(path)).toBe(true);
    });

    it.each([
        'tests/unit/scripts/git-base.test.ts',
        'tests/cross-cutting/guarded-steps-stay-unpublished.test.ts',
        'src/modules/orders/tests/unit/totals.test.ts'
    ])('skips %s, which light already runs', (path) => {
        expect(isOutsideLightGate(path)).toBe(false);
    });

    it.each([
        'src/modules/orders/service.ts',
        'tests/support/stub.ts',
        'src/modules/orders/order.test.ts'
    ])('skips %s, which is not a jest test file', (path) => {
        expect(isOutsideLightGate(path)).toBe(false);
    });
});
