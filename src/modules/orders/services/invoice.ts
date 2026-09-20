/**
 * @module
 * The invoice: a view of the order, rendered when someone asks for it — never a durable artefact
 * with a lifecycle of its own. `GET /orders/{id}/invoice` renders synchronously on the request
 * thread, and so will `notify.ts`'s placed-order email once it starts attaching one. A TTL cache
 * sits in front of the render so a burst of requests for the same order pays for one Chromium
 * launch, not one per request — `invoiceCacheTtlMinutes()` decides whether it is even consulted.
 */

import path from 'node:path';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import ejs from 'ejs';
import { logger } from '@infrastructure/adapters/logger';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { getDefaultLocale } from '@infrastructure/i18n';
import { orderRepository } from '../repository';
import { invoiceDocument, type InvoiceOrder } from '../emails';
import { invoiceCachePath, invoiceCacheTtlMinutes } from '../config';

/** The EJS template every invoice render — cached or not — prints. */
const INVOICE_TEMPLATE = path.resolve('shared', 'templates', 'documents', 'orders.invoice.ejs');

/** One order's cached invoice path — deterministic from `orderId` alone. */
const invoicePdfPath = (orderId: string): string => path.join(invoiceCachePath(), `${orderId}.pdf`);

/**
 * A cache hit: the file exists and its `mtime` is within `ttlMinutes`. An expired file is treated
 * as a miss — rendered over on write, never read past its TTL.
 */
const readCached = (orderId: string, ttlMinutes: number): Promise<Buffer | undefined> => {
    const target = invoicePdfPath(orderId);
    return stat(target)
        .then((info) =>
            Date.now() - info.mtimeMs <= ttlMinutes * 60 * 1000 ? readFile(target) : undefined
        )
        .catch(() => undefined);
};

/** Writes a fresh render to the cache — created on demand, mirroring `image-store.ts`'s own directories. */
const writeCache = (orderId: string, bytes: Buffer): Promise<void> =>
    mkdir(invoiceCachePath(), { recursive: true }).then(() =>
        writeFile(invoicePdfPath(orderId), bytes)
    );

/**
 * Renders one order's invoice PDF from scratch — the DB read, the template, Chromium. Never reads
 * or writes the cache; {@link renderInvoicePdf} is the only caller.
 */
const renderFresh = (orderId: string): Promise<Buffer | undefined> =>
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
 * Renders one order's invoice PDF — no status field, no queue, nothing to poll. A `0` TTL
 * (`invoiceCacheTtlMinutes()` — demo, test, or a deployment that opted out) means the render never
 * touches disk at all, streamed straight from the buffer; otherwise a cache hit is served with no
 * new Chromium launch, and a miss renders fresh and writes the cache behind it.
 *
 * The render locale is the order's OWN frozen locale (`items[0].locale` — the language its
 * product titles were resolved into at checkout), never a viewer's request locale: an invoice is a
 * record of what was sold, in the language it was sold in.
 *
 * @param orderId - the order to render
 * @returns the rendered PDF's bytes, or `undefined` for an order that does not exist
 */
export const renderInvoicePdf = (orderId: string): Promise<Buffer | undefined> => {
    const ttlMinutes = invoiceCacheTtlMinutes();
    if (ttlMinutes <= 0) return renderFresh(orderId);

    return readCached(orderId, ttlMinutes).then(
        (cached) =>
            cached ??
            renderFresh(orderId).then((bytes) =>
                bytes ? writeCache(orderId, bytes).then(() => bytes) : bytes
            )
    );
};

/**
 * Deletes an order's cached invoice PDF, if one exists — `remove()`'s hard-delete cleanup, any
 * write that changes what the invoice prints (`services/crud.ts`'s line-rewrite path), and
 * {@link reapOrphanedInvoices}'s per-file action once a name has no order left to name it. Status
 * moves and cancellations never call this: nothing about them appears on the invoice.
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

/** Every cached filename this store could have written, alongside the cache root they live under. */
const cachedInvoiceNames = (): Promise<{ root: string; names: string[] }> => {
    const root = invoiceCachePath();

    return readdir(root)
        .catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        })
        .then((entries) => ({
            root,
            names: entries.filter(
                (name) => name.endsWith('.pdf') && ORDER_ID_PATTERN.test(name.slice(0, -4))
            )
        }));
};

/**
 * Deletes every cached invoice PDF with no order left to name it — `ops/reap-invoices.ts`'s one
 * sweep, {@link reapExpiredInvoices} being its other. An orphan is not a normal outcome: `remove()`'s
 * hard-delete path cleans up its own file the moment the order goes. It happens anyway wherever a
 * row is removed OUTSIDE that path — a scenario reset's `emptyDatabase()` (dev/test only, but the
 * reason this exists at all), a manual `deleteMany`, a crash between a hard delete's two steps.
 *
 * A filename that is not `<24-hex id>.pdf` is left alone rather than risking `existingIds`'s
 * `toObjectId` throwing on it — someone else's file, not this reaper's to judge.
 *
 * @returns how many files were deleted
 */
export const reapOrphanedInvoices = (): Promise<number> =>
    cachedInvoiceNames().then(({ names }) => {
        const candidates = names.map((name) => name.slice(0, -4));
        if (candidates.length === 0) return 0;

        return orderRepository.existingIds(candidates).then((existing) => {
            const orphaned = candidates.filter((id) => !existing.has(id));
            return Promise.all(orphaned.map((id) => deleteCachedInvoice(id))).then(
                (results) => results.filter(Boolean).length
            );
        });
    });

/**
 * Deletes every cached invoice past its TTL — `ops/reap-invoices.ts`'s other sweep, next to
 * {@link reapOrphanedInvoices}. The cache's whole job is to absorb one person's burst; a file
 * older than `invoiceCacheTtlMinutes()` is personal and financial data sitting on disk for
 * nobody, whatever else is true about the order it belongs to.
 *
 * @returns how many files were deleted
 */
export const reapExpiredInvoices = (): Promise<number> => {
    const cutoffMs = invoiceCacheTtlMinutes() * 60 * 1000;

    return cachedInvoiceNames().then(({ root, names }) =>
        Promise.all(
            names.map((name) =>
                stat(path.join(root, name)).then((info) =>
                    Date.now() - info.mtimeMs > cutoffMs
                        ? deleteCachedInvoice(name.slice(0, -4))
                        : false
                )
            )
        ).then((results) => results.filter(Boolean).length)
    );
};
