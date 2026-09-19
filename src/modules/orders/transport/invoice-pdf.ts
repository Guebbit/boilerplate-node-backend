/**
 * @module
 * Async invoice PDF pipeline: the storage it writes to, the queue consumer that fills it, and the
 * two enqueue helpers — one the module's `order.created` listener calls, one
 * `controllers/get-order-invoice.ts` calls to self-heal an order with no render in flight. This
 * file OWNS generation and storage; the controller only ever reads what's already written, or
 * asks this file to queue one — it never renders on the request thread itself.
 *
 * Mirrors `webhooks/transport/` — module-owned infrastructure code, not domain business logic.
 * See `../asyncapi.internal.yaml`'s header for why the payload carries `orderId` alone: the
 * worker resolves its own template and output location, never anything the message says, which
 * closes off the arbitrary-file-write/RCE a producer-chosen path would otherwise open.
 */

import path from 'node:path';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import ejs from 'ejs';
import { logger } from '@infrastructure/adapters/logger';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { publishToQueue, isQueueEnabled } from '@infrastructure/adapters/queue';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';
import { getDefaultLocale } from '@infrastructure/i18n';
import { WORKER_CHANNELS } from '@types';
import type { OrderInvoicePdfJobPayload } from '@types';
import { orderRepository } from '../repository';
import { invoiceDocument, type InvoiceOrder } from '../emails';

/** The EJS template both the sync fallback and this worker render — see `get-order-invoice.ts`. */
const INVOICE_TEMPLATE = path.resolve('shared', 'templates', 'documents', 'orders.invoice.ejs');

/**
 * Where the invoice worker writes each order's stored PDF — durable, and OUTSIDE
 * `NODE_PUBLIC_PATH` for the same reason `image-store.ts`'s quarantine directory is: an invoice
 * carries personal and financial data, and must only be reachable through the authenticated
 * controller, never as a guessable static url.
 */
const invoiceStorageRoot = (): string =>
    path.resolve(process.env.NODE_INVOICE_STORAGE_PATH ?? 'storage/invoices');

/**
 * The stored PDF's path for one order — deterministic from `orderId` alone, so no separate url
 * field needs to travel on the order document: `invoicePdfStatus` already says whether it exists.
 */
const invoicePdfPath = (orderId: string): string =>
    path.join(invoiceStorageRoot(), `${orderId}.pdf`);

/**
 * Reads a stored invoice back, for `GET /orders/{id}/invoice` once `invoicePdfStatus` is `ready`.
 *
 * @param orderId - the order to read
 * @returns the PDF's bytes, or `undefined` when nothing is stored — should not happen once
 *   `ready`, but answering `undefined` rather than letting an `ENOENT` reject keeps the
 *   controller's two branches (ready, not) reading the same way
 */
export const readStoredInvoicePdf = (orderId: string): Promise<Buffer | undefined> =>
    readFile(invoicePdfPath(orderId)).catch(() => undefined);

/** A Mongo ObjectId's own shape — what every `<orderId>.pdf` this pipeline writes is named after. */
const ORDER_ID_PATTERN = /^[\da-f]{24}$/;

/**
 * Deletes an order's stored invoice PDF, if one exists — `remove()`'s hard-delete cleanup, and
 * {@link reapOrphanedInvoices}'s per-file action once a name has no order left to name it.
 *
 * Never rejects, matching `imageStore.remove()`: an order can be hard-deleted before its invoice
 * ever rendered (cancelled, or the render still in flight), and "nothing was there to delete" is
 * not a failure either caller needs to handle differently from "it was there, and now it's gone".
 *
 * @param orderId - the order whose stored PDF to remove
 * @returns whether a file was actually deleted
 */
export const deleteStoredInvoicePdf = (orderId: string): Promise<boolean> =>
    unlink(invoicePdfPath(orderId)).then(
        () => true,
        (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                logger.warn({ message: 'Could not delete stored invoice PDF.', orderId, error });
            return false;
        }
    );

/**
 * Deletes every stored invoice PDF with no order left to name it — `ops/reap-invoices.ts`'s whole
 * job. An orphan is not a normal outcome of this pipeline: `remove()`'s hard-delete path cleans up
 * its own file the moment the order goes. It happens anyway wherever a row is removed OUTSIDE that
 * path — a scenario reset's `emptyDatabase()` (dev/test only, but the reason this exists at all),
 * a manual `deleteMany`, a crash between a hard delete's two steps.
 *
 * A filename that is not `<24-hex id>.pdf` (the only shape this pipeline ever writes) is left
 * alone rather than risking `existingIds`' `toObjectId` throwing on it — someone else's file, not
 * this reaper's to judge.
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
                return Promise.all(orphaned.map((id) => deleteStoredInvoicePdf(id))).then(
                    (results) => results.filter(Boolean).length
                );
            });
        });
};

/**
 * Renders and durably stores one order's invoice PDF, then marks it `ready` — the step both the
 * queue handler and the no-broker inline fallback run.
 *
 * The render locale is the order's OWN frozen locale (`items[0].locale` — the language its
 * product titles were resolved into at checkout), not a viewer's request locale: there is no
 * request here, or anywhere else in this pipeline — every render, for every order, goes through
 * this one function now.
 *
 * @param orderId - the order to render
 */
const generateAndStoreInvoicePdf = (orderId: string): Promise<void> =>
    orderRepository.findByIdRaw(orderId).then((order) => {
        if (!order) {
            // Hard-deleted between enqueue and drain — nothing to render, and nothing worth
            // retrying either.
            logger.warn({
                message: 'Invoice PDF job named an order that no longer exists.',
                orderId
            });
            return undefined;
        }

        const invoiceOrder: InvoiceOrder = {
            id: orderId,
            items: order.items,
            shippingCost: order.shippingCost,
            invoiceNumber: order.invoiceNumber,
            createdAt: order.createdAt
        };
        const locale = order.items[0]?.locale ?? getDefaultLocale();

        return (
            mkdir(invoiceStorageRoot(), { recursive: true })
                .then(() => ejs.renderFile(INVOICE_TEMPLATE, invoiceDocument(locale, invoiceOrder)))
                .then((html) =>
                    renderHtmlToPdf(html, { format: 'A4', path: invoicePdfPath(orderId) })
                )
                .then(() => orderRepository.markInvoicePdfReady(orderId))
                // A poller's earlier `pending` answer may already be sitting in the `orders` tag's
                // cache — this is what makes the very next read see `ready` rather than wait out the
                // hour-long TTL `GET /orders/{id}` and `/invoice` are both cached under.
                .then(() => invalidateCacheTagsLogged(['orders']))
                .then(() => undefined)
        );
    });

/**
 * Drains one invoice-generation job. Same split as every other worker in this repo: a payload
 * naming no order dead-letters, a failed render is left to reject so the broker redelivers it.
 */
export const handleInvoicePdfJob = (job: Partial<OrderInvoicePdfJobPayload>): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.orderId) {
        logger.warn({ message: 'Invalid invoice PDF job payload, discarding.', job });
        return Promise.resolve(false);
    }

    return generateAndStoreInvoicePdf(job.orderId)
        .then(() => true)
        .catch((error: unknown) => {
            logger.error({ message: 'Invoice PDF worker failed.', orderId: job.orderId, error });
            throw error;
        });
};

/**
 * Enqueues invoice generation for a just-created order — the module's `order.created` listener's
 * one job. Queue-aware, the same fallback shape `enqueueEmail` uses: no broker configured, or a
 * publish that fails, runs the render inline instead of leaving the order stuck `pending` with
 * nothing ever able to flip it — the common case in a dev/demo deployment with no RabbitMQ.
 *
 * @param orderId - the order that was just written
 */
export const enqueueInvoicePdfJob = (orderId: string): Promise<void> => {
    if (!isQueueEnabled()) return generateAndStoreInvoicePdf(orderId);

    return publishToQueue<OrderInvoicePdfJobPayload>({
        queue: WORKER_CHANNELS.ORDERS_INVOICE_GENERATE,
        payload: { orderId }
    }).then((published) => (published ? undefined : generateAndStoreInvoicePdf(orderId)));
};

/**
 * Self-heals a delivery gap instead of ever rendering on the request thread:
 * `controllers/get-order-invoice.ts`'s ONLY path for an order whose `invoicePdfStatus` is absent
 * (it predates this field — no job was ever queued for it) or `ready` with nothing on disk (a
 * data anomaly). Stamps `pending` first (`repository.ts#markInvoicePdfPending`'s own guard makes
 * this a no-op while a render is already in flight, so a client polling mid-render can't
 * re-enqueue on every request), then queues exactly the same job a fresh order's `order.created`
 * listener would.
 *
 * @param orderId - the order to (re)queue a render for
 */
export const enqueueInvoicePdfRetry = (orderId: string): Promise<void> =>
    orderRepository.markInvoicePdfPending(orderId).then((flipped) =>
        // Already `pending`: something else's render is in flight — nothing more to enqueue.
        flipped ? enqueueInvoicePdfJob(orderId) : undefined
    );
