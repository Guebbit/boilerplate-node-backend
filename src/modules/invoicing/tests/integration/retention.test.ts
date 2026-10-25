/**
 * @module
 * `reap:invoices` end to end: an invoice or credit note loses its buyer block at the end of its
 * tax retention, keeps everything else, loses its cached PDF, and a second run changes nothing.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import invoicingModule from '@modules/invoicing/module';
import { orderService } from '@modules/orders';
import { writeDocument } from '@infrastructure/adapters/document-store';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { creditNoteModel, invoiceModel } from '../../model';
import { invoicingRepository } from '../../repository';
import { invoicingService } from '../../services';
import { issueCreditNote, waitForInvoice } from '../factories';

setupTestDb();

let root: string;

beforeEach(async () => {
    registerModules([usersModule, productsModule, inventoryModule, ordersModule, invoicingModule]);
    root = await mkdtemp(path.join(tmpdir(), 'invoice-retention-'));
    setEnvironment({ NODE_DOCUMENT_STORE_PATH: root });
});

afterEach(() => {
    resetDomainEvents();
    return rm(root, { recursive: true, force: true });
});

/** A paid order's invoice, with a buyer block, issued at `issuedAt` in `timezone`. */
const invoiceIssuedAt = async (issuedAt: string, timezone = 'Europe/Rome') => {
    const user = await createUser();
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        billingAddress: {
            fullName: 'Ada Lovelace',
            street: '1 Way',
            city: 'London',
            zip: 'W1A 1AA',
            country: 'GB'
        }
    });
    await orderService.markPaid(String(order._id));
    const invoice = await waitForInvoice(String(order._id));
    await invoiceModel.updateOne({ _id: invoice._id }, { issuedAt: new Date(issuedAt), timezone });
    return { orderId: String(order._id), invoiceId: invoice._id };
};

/** The buyer block still stored on an invoice. */
const invoiceBuyer = (id: unknown) =>
    invoiceModel
        .findById(id)
        .exec()
        .then((invoice) => invoice?.billingAddress);

/** The buyer block still stored on a credit note. */
const creditNoteBuyer = (id: unknown) =>
    creditNoteModel
        .findById(id)
        .exec()
        .then((note) => note?.billingAddress);

describe('reap:invoices', () => {
    it('blanks the buyer once local New Year of issue year + 11 has come, and not a minute before', async () => {
        const { invoiceId } = await invoiceIssuedAt('2015-06-01T10:00:00Z');

        await invoicingService.eraseDueBuyers(new Date('2025-12-31T22:59:00Z'));
        expect(await invoiceBuyer(invoiceId)).toBeDefined();

        const report = await invoicingService.eraseDueBuyers(new Date('2025-12-31T23:30:00Z'));
        const after = await invoiceModel.findById(invoiceId);

        expect(report).toEqual({ invoices: 1, creditNotes: 0 });
        expect(after?.billingAddress).toBeUndefined();
        expect(after?.buyerErasedAt).toEqual(new Date('2025-12-31T23:30:00Z'));
    });

    it('counts a 31 Dec 23:30 UTC invoice into the next year, as Rome does', async () => {
        const { invoiceId } = await invoiceIssuedAt('2015-12-31T23:30:00Z');

        await invoicingService.eraseDueBuyers(new Date('2026-06-01T00:00:00Z'));

        expect(await invoiceBuyer(invoiceId)).toBeDefined();
    });

    it('keeps every other field and the stats totals', async () => {
        const { invoiceId } = await invoiceIssuedAt('2015-06-01T10:00:00Z');
        const before = await invoiceModel.findById(invoiceId).lean();
        const window = {
            from: new Date('2015-01-01T00:00:00Z'),
            to: new Date('2016-01-01T00:00:00Z'),
            interval: 'month' as const,
            timeZone: 'Europe/Rome'
        };
        const totalsBefore = await invoicingRepository.sumInvoices(window);

        await invoicingService.eraseDueBuyers(new Date('2030-01-01T00:00:00Z'));
        const after = await invoiceModel.findById(invoiceId).lean();

        expect({
            ...after,
            billingAddress: undefined,
            buyerErasedAt: undefined,
            updatedAt: 0
        }).toEqual({
            ...before,
            billingAddress: undefined,
            buyerErasedAt: undefined,
            updatedAt: 0
        });
        expect(await invoicingRepository.sumInvoices(window)).toEqual(totalsBefore);
    });

    it('runs a credit note on its own issue date', async () => {
        const { orderId, invoiceId } = await invoiceIssuedAt('2015-06-01T10:00:00Z');
        const note = await issueCreditNote({
            orderId,
            refundId: 'refund-1',
            amount: 5,
            full: false
        });
        await creditNoteModel.updateOne(
            { _id: note?._id },
            { issuedAt: new Date('2020-06-01T10:00:00Z') }
        );

        const report = await invoicingService.eraseDueBuyers(new Date('2026-01-01T00:00:00Z'));

        expect(report).toEqual({ invoices: 1, creditNotes: 0 });
        expect(await creditNoteBuyer(note?._id)).toBeDefined();
        expect(await invoiceBuyer(invoiceId)).toBeUndefined();
    });

    it('deletes the cached PDF of an erased document and leaves the others', async () => {
        const { invoiceId } = await invoiceIssuedAt('2015-06-01T10:00:00Z');
        await writeDocument(`invoice-${String(invoiceId)}.pdf`, Buffer.from('%PDF-1'));
        await writeDocument('invoice-someone-else.pdf', Buffer.from('%PDF-1'));

        await invoicingService.eraseDueBuyers(new Date('2030-01-01T00:00:00Z'));

        expect(await readdir(root)).toEqual(['invoice-someone-else.pdf']);
    });

    it('changes nothing on a second run', async () => {
        await invoiceIssuedAt('2015-06-01T10:00:00Z');
        await invoicingService.eraseDueBuyers(new Date('2030-01-01T00:00:00Z'));

        const second = await invoicingService.eraseDueBuyers(new Date('2031-01-01T00:00:00Z'));

        expect(second).toEqual({ invoices: 0, creditNotes: 0 });
    });
});
