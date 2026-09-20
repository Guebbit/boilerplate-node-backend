/**
 * @module
 * The invoice: a view of the order, rendered when someone asks for it — never a durable artefact
 * with a lifecycle of its own. `GET /orders/{id}/invoice` renders synchronously on the request
 * thread, and so will `notify.ts`'s placed-order email once it starts attaching one. A rendered
 * order is never wrong to re-render: there is no separate status to fall out of sync with it.
 */

import path from 'node:path';
import { readdir, unlink } from 'node:fs/promises';
import ejs from 'ejs';
import { logger } from '@infrastructure/adapters/logger';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { getDefaultLocale } from '@infrastructure/i18n';
import { orderRepository } from '../repository';
import { invoiceDocument, type InvoiceOrder } from '../emails';

/** The EJS template every invoice render — request thread or otherwise — prints. */
const INVOICE_TEMPLATE = path.resolve('shared', 'templates', 'documents', 'orders.invoice.ejs');

/**
 * Where a rendered invoice may be cached — OUTSIDE `NODE_PUBLIC_PATH` for the same reason
 * `image-store.ts`'s quarantine directory is: an invoice carries personal and financial data, and
 * must only be reachable through the authenticated controller, never as a guessable static url.
 * Nothing writes here yet — see `deleteCachedInvoice`/`reapOrphanedInvoices` below, kept ready for
 * the cache that lands next.
 */
const invoiceStorageRoot = (): string =>
    path.resolve(process.env.NODE_INVOICE_STORAGE_PATH ?? 'storage/invoices');

/** One order's cached invoice path — deterministic from `orderId` alone. */
const invoicePdfPath = (orderId: string): string =>
    path.join(invoiceStorageRoot(), `${orderId}.pdf`);

/**
 * Renders one order's invoice PDF, fresh every time — no status field, no queue, nothing to poll.
 *
 * The render locale is the order's OWN frozen locale (`items[0].locale` — the language its
 * product titles were resolved into at checkout), never a viewer's request locale: an invoice is a
 * record of what was sold, in the language it was sold in.
 *
 * @param orderId - the order to render
 * @returns the rendered PDF's bytes, or `undefined` for an order that does not exist
 */
export const renderInvoicePdf = (orderId: string): Promise<Buffer | undefined> =>
    orderRepository.findByIdRaw(orderId).then((order) => {
        if (!order) return undefined;

        const invoiceOrder: InvoiceOrder = {
            id: orderId,
            items: order.items,
            shippingCost: order.shippingCost,
            invoiceNumber: order.invoiceNumber,
            createdAt: order.createdAt
        };
        const locale = order.items[0]?.locale ?? getDefaultLocale();

        return ejs
            .renderFile(INVOICE_TEMPLATE, invoiceDocument(locale, invoiceOrder))
            .then((html) => renderHtmlToPdf(html, { format: 'A4' }))
            .then((bytes) => Buffer.from(bytes));
    });

/**
 * Deletes an order's cached invoice PDF, if one exists — `remove()`'s hard-delete cleanup, and
 * {@link reapOrphanedInvoices}'s per-file action once a name has no order left to name it.
 *
 * Never rejects, matching `imageStore.remove()`: nothing here is a failure a caller needs to
 * handle differently from "there was nothing cached".
 *
 * @param orderId - the order whose cached PDF to remove
 * @returns whether a file was actually deleted
 */
export const deleteCachedInvoice = (orderId: string): Promise<boolean> =>
    unlink(invoicePdfPath(orderId)).then(
        () => true,
        (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                logger.warn({ message: 'Could not delete cached invoice PDF.', orderId, error });
            return false;
        }
    );

/** A Mongo ObjectId's own shape — what every `<orderId>.pdf` this cache ever writes is named after. */
const ORDER_ID_PATTERN = /^[\da-f]{24}$/;

/**
 * Deletes every cached invoice PDF with no order left to name it — `ops/reap-invoices.ts`'s whole
 * job. An orphan is not a normal outcome: `remove()`'s hard-delete path cleans up its own file the
 * moment the order goes. It happens anyway wherever a row is removed OUTSIDE that path — a
 * scenario reset's `emptyDatabase()` (dev/test only, but the reason this exists at all), a manual
 * `deleteMany`, a crash between a hard delete's two steps.
 *
 * A filename that is not `<24-hex id>.pdf` is left alone rather than risking `existingIds`'s
 * `toObjectId` throwing on it — someone else's file, not this reaper's to judge.
 *
 * @returns how many files were deleted
 */
export const reapOrphanedInvoices = (): Promise<number> => {
    const root = invoiceStorageRoot();

    return readdir(root)
        .catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        })
        .then((entries) => {
            const candidates = entries
                .filter((name) => name.endsWith('.pdf') && ORDER_ID_PATTERN.test(name.slice(0, -4)))
                .map((name) => name.slice(0, -4));

            if (candidates.length === 0) return 0;

            return orderRepository.existingIds(candidates).then((existing) => {
                const orphaned = candidates.filter((id) => !existing.has(id));
                return Promise.all(orphaned.map((id) => deleteCachedInvoice(id))).then(
                    (results) => results.filter(Boolean).length
                );
            });
        });
};
