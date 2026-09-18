/**
 * @module
 * `recordCreated`'s audit trail — no path may force `actor_role`/`actor_role_name` to a fixed
 * value. `DDD_FIX.md` D3.4: checkout used to force `actor_role: 'user'` "because a purchase is a
 * customer action"; under D1-Q10 (real role names everywhere) that override is gone, so an
 * `order_created` audit row always reflects the real caller, whoever placed the order.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { create } from '@modules/orders/services';
import { ordersAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerAs } from '../../../../../tests/support/callers';
import type { CallerContext } from '@types';

/*
 * The audit port is REPLACED, not spied on — see `cancel.test.ts` for the full reasoning
 * (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes).
 */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** A `CallerContext` carrying a real, named tenant role — what a resolved HTTP request builds. */
const contextAs = (role: string, id = 'test-moderator'): CallerContext => ({
    caller: callerAs(role, id),
    actorRoleName: role,
    analyticsConsent: false
});

describe('create — the audit row records the real caller, never a forced label', () => {
    it('an order placed by a moderator is audited with that real role name', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });

        await create(
            String(buyer._id),
            buyer.email,
            [{ productId: String(product._id), quantity: 1 }],
            contextAs('moderator')
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CREATED,
                outcome: 'success',
                actor_role_name: 'moderator'
            })
        );
    });

    it("an order placed by an admin account is audited as 'admin', not silently as a customer", async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();
        const product = await createProduct({ title: 'Mouse', price: 10 });

        await create(
            String(buyer._id),
            buyer.email,
            [{ productId: String(product._id), quantity: 1 }],
            contextAs('admin')
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CREATED,
                actor_role_name: 'admin'
            })
        );
    });
});
