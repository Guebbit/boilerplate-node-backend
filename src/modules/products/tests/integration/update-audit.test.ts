/**
 * @module
 * What `ADMIN_PRODUCT_UPDATED` says about an edit: every non-text field it actually moved, as
 * `{ from, to }` (what a buyer pays, what VAT is charged, what shipping weighs, the right of
 * withdrawal, whether it is published or on sale), and the free-text fields and picture by name
 * only. A "lower, sell, restore" has to be readable from the audit trail, not rebuilt from frozen
 * order lines.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../services';
import { productsAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';

/* The audit port is replaced, not spied on — see `delete-restore-audit.test.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `metadata` of the one `ADMIN_PRODUCT_UPDATED` row an update wrote. */
const updatedRowMetadata = (spy: jest.SpiedFunction<typeof auditPort.emitAuditEvent>) =>
    spy.mock.calls
        .map(([entry]) => entry)
        .find((entry) => entry.action === productsAuditActions.ADMIN_PRODUCT_UPDATED)?.metadata;

describe('productService.updateById — the audit row of a money edit', () => {
    it('carries from and to for each of price, taxClass and rateType that moved', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({
            price: 10,
            taxClass: 'reduced',
            rateType: 'standard'
        });

        await productService.updateById(
            String(product._id),
            { price: 4.5, taxClass: 'zero', rateType: 'exempt' },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({
            changes: {
                price: { from: 10, to: 4.5 },
                taxClass: { from: 'reduced', to: 'zero' },
                rateType: { from: 'standard', to: 'exempt' }
            }
        });
    });

    it('says null for a field that was unset or is cleared', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ price: 10, taxClass: 'reduced' });

        await productService.updateById(
            String(product._id),
            { taxClass: null, rateType: 'standard' },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({
            changes: {
                taxClass: { from: 'reduced', to: null },
                rateType: { from: null, to: 'standard' }
            }
        });
    });

    it('carries from and to for the rights, shipping and publishing fields too', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({
            price: 10,
            active: true,
            purchasable: true,
            requiresShipping: true,
            noWithdrawal: false,
            weight: 500,
            sku: 'OLD-1',
            categories: ['mugs'],
            tags: ['red']
        });

        await productService.updateById(
            String(product._id),
            {
                active: false,
                purchasable: false,
                requiresShipping: false,
                noWithdrawal: true,
                weight: null,
                sku: 'NEW-1',
                categories: ['cups'],
                tags: ['red']
            },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({
            changes: {
                active: { from: true, to: false },
                purchasable: { from: true, to: false },
                requiresShipping: { from: true, to: false },
                noWithdrawal: { from: false, to: true },
                weight: { from: 500, to: null },
                sku: { from: 'OLD-1', to: 'NEW-1' },
                categories: { from: ['mugs'], to: ['cups'] }
            }
        });
    });

    it('records a moved release date, and names a changed title without copying it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ title: 'Old title' });

        await productService.updateById(
            String(product._id),
            {
                translations: { en: { title: 'A different title' } },
                releaseDate: '2031-01-01T00:00:00.000Z'
            },
            callerContextAs('admin')
        );

        const metadata = updatedRowMetadata(auditSpy);
        expect(metadata).toEqual({
            changes: { releaseDate: { from: null, to: '2031-01-01T00:00:00.000Z' } },
            changedFields: ['title']
        });
        expect(JSON.stringify(metadata)).not.toContain('different title');
    });

    it('names only what moved: a price or a scalar sent unchanged writes no changes, and a rename is a name only', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ price: 10 });

        await productService.updateById(
            String(product._id),
            { price: 10, active: true, translations: { en: { title: 'Renamed' } } },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({ changedFields: ['title'] });
    });
});
