/**
 * @module
 * Async invoice PDF pipeline: the storage it writes to, the queue consumer that fills it, and the
 * enqueue helper the module's `order.created` listener calls. Same split
 * `controllers/get-order-invoice.ts` keeps for orders that predate this feature: this file OWNS
 * generation and storage, the controller only reads what's already written, or falls back to
 * rendering the way every order did before this queue existed.
 *
 * Mirrors `webhooks/transport/` — module-owned infrastructure code, not domain business logic —
 * and replaces the old domainless `worker.pdf.generate` queue. See `../asyncapi.internal.yaml`'s
 * header for why the payload shrank to `orderId` alone: the old one carried a raw template path
 * and a raw output path chosen by the producer, a latent arbitrary-file-write/RCE waiting on
 * nothing more than a producer that never existed.
 */

import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
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

/**
 * Renders and durably stores one order's invoice PDF, then marks it `ready` — the step both the
 * queue handler and the no-broker inline fallback run.
 *
 * The render locale is the order's OWN frozen locale (`items[0].locale` — the language its
 * product titles were resolved into at checkout), not a viewer's request locale: there is no
 * request here. `GET /orders/{id}/invoice`'s synchronous fallback for pre-existing orders still
 * renders in the DOWNLOADER's language instead — a different document by design, not a bug, since
 * that path really does run inside a request with a locale to read.
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
