/**
 * `src/app/demo.ts`'s `restoreScenario` for the `blank` scenario — harness infrastructure only,
 * against a real database. Exercised as a function call rather than over HTTP: `installDemo`'s
 * route is a thin wrapper around this, gated behind `NODE_DEMO` at import time, which this suite
 * has no reason to flip.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { restoreScenario } from '@app/demo';
import { userModel } from '@modules/users/model';
import { productModel } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { localeModel } from '@modules/locales/model';
import { roleModel } from '@kernel/access/models';

setupTestDb();

describe('the `blank` scenario', () => {
    it('seeds only the four named accounts, roles and locales — no shop data', async () => {
        await restoreScenario(false, 'blank');

        await expect(userModel.countDocuments()).resolves.toBe(4);
        await expect(roleModel.countDocuments()).resolves.toBeGreaterThan(0);
        await expect(localeModel.countDocuments()).resolves.toBeGreaterThan(0);
        await expect(productModel.countDocuments()).resolves.toBe(0);
        await expect(orderModel.countDocuments()).resolves.toBe(0);
    });
});
