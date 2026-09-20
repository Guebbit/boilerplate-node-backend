/**
 * @module
 * The invoice: a view of the order, rendered when someone asks for it — never a durable artefact
 * with a lifecycle of its own. `GET /orders/{id}/invoice` renders synchronously on the request
 * thread, and so will `notify.ts`'s placed-order email once it starts attaching one. A TTL cache
 * sits in front of the render so a burst of requests for the same order pays for one Chromium
 * launch, not one per request — `invoiceCacheTtlMinutes()` decides whether it is even consulted.
 * Single-flight collapses a CONCURRENT burst the same way; the TTL cache alone only bounds a
 * sequential one — see {@link renderFreshOnce}.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
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

/**
 * Writes a fresh render to the cache — created on demand, mirroring `image-store.ts`'s own
 * directories. Written to a per-write temp name first, then renamed onto the deterministic final
 * path: `invoicePdfPath` is the same path for every render of one order, so two concurrent misses
 * writing it directly could interleave and leave {@link readCached} streaming a truncated PDF.
 * `rename` is atomic within one filesystem, and the loser of the race simply overwrites with
 * identical bytes. `reapExpiredInvoices` collects a temp file a crash left behind, the same as a
 * finished one — see `TEMP_INVOICE_PATTERN`.
 */
const writeCache = (orderId: string, bytes: Buffer): Promise<void> => {
    const temporaryPath = path.join(
        invoiceCachePath(),
        `${orderId}.${randomBytes(16).toString('hex')}.tmp`
    );

    return mkdir(invoiceCachePath(), { recursive: true })
        .then(() => writeFile(temporaryPath, bytes))
        .then(() => rename(temporaryPath, invoicePdfPath(orderId)));
};

/**
 * Renders one order's invoice PDF from scratch — the DB read, the template, Chromium. Never reads
 * or writes the cache; {@link renderFreshOnce} is the only caller.
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

/** One render per orderId at a time — see {@link renderFreshOnce}. */
const inFlightRenders = new Map<string, Promise<Buffer | undefined>>();

/**
 * {@link renderFresh}, collapsed across concurrent callers: a miss registers its own promise
 * before awaiting anything, and a concurrent miss for the SAME orderId joins it instead of
 * launching a second Chromium — the TTL cache alone only bounds a SEQUENTIAL burst, since N
 * concurrent requests all miss {@link readCached} before any of them has written the cache back.
 * Removed from the map the moment it settles, success or failure, so the next real miss (past the
 * TTL, or once this one is done) starts fresh. Per-process only, the same guarantee nginx's
 * `proxy_cache_lock` and Varnish's request collapsing give per-node — a second replica rendering
 * the same invoice once is not the problem this solves.
 */
const renderFreshOnce = (orderId: string): Promise<Buffer | undefined> => {
    const inFlight = inFlightRenders.get(orderId);
    if (inFlight) return inFlight;

    const render = renderFresh(orderId).finally(() => inFlightRenders.delete(orderId));
    inFlightRenders.set(orderId, render);
    return render;
};

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
    if (ttlMinutes <= 0) return renderFreshOnce(orderId);

    return readCached(orderId, ttlMinutes).then(
        (cached) =>
            cached ??
            renderFreshOnce(orderId).then((bytes) =>
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
const ORDER_ID_PATTERN = /^([\da-f]{24})\.pdf$/;

/**
 * `<orderId>.<random hex>.tmp` — {@link writeCache}'s own temp name, left behind only when a
 * process crashes between the write and the rename onto {@link invoicePdfPath}. Swept by both
 * reapers below, the same as a finished `.pdf`, since neither the order it belongs to nor its age
 * is knowable from the name alone otherwise.
 */
const TEMP_INVOICE_PATTERN = /^([\da-f]{24})\.[\da-f]{32}\.tmp$/;

/** One cached file this store could have written — its bare filename and the orderId it names. */
interface CachedInvoiceFile {
    name: string;
    orderId: string;
}

/** Every cached file this store could have written, alongside the cache root they live under. */
const cachedInvoiceFiles = (): Promise<{ root: string; files: CachedInvoiceFile[] }> => {
    const root = invoiceCachePath();

    return readdir(root)
        .catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        })
        .then((entries) => ({
            root,
            files: entries.flatMap((name) => {
                const orderId = (ORDER_ID_PATTERN.exec(name) ??
                    TEMP_INVOICE_PATTERN.exec(name))?.[1];
                return orderId ? [{ name, orderId }] : [];
            })
        }));
};

/**
 * Deletes one cached file outright, by its bare name — the reapers' own primitive.
 * {@link deleteCachedInvoice} stays the public, orderId-keyed door for an on-demand delete; this
 * one also reaches a stale `.tmp` a reaper found, which no orderId alone resolves a path for.
 */
const deleteCacheFile = (root: string, name: string): Promise<boolean> =>
    unlink(path.join(root, name)).then(
        () => true,
        (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                logger.warn({ message: 'Could not delete cached invoice file.', name, error });
            return false;
        }
    );

/**
 * Deletes every cached file with no order left to name it — `ops/reap-invoices.ts`'s one sweep,
 * {@link reapExpiredInvoices} being its other. An orphan is not a normal outcome: `remove()`'s
 * hard-delete path cleans up its own file the moment the order goes. It happens anyway wherever a
 * row is removed OUTSIDE that path — a scenario reset's `emptyDatabase()` (dev/test only, but the
 * reason this exists at all), a manual `deleteMany`, a crash between a hard delete's two steps.
 *
 * A filename matching neither {@link ORDER_ID_PATTERN} nor {@link TEMP_INVOICE_PATTERN} is left
 * alone rather than risking `existingIds`'s `toObjectId` throwing on it — someone else's file, not
 * this reaper's to judge.
 *
 * @returns how many files were deleted
 */
export const reapOrphanedInvoices = (): Promise<number> =>
    cachedInvoiceFiles().then(({ root, files }) => {
        if (files.length === 0) return 0;

        const orderIds = [...new Set(files.map((file) => file.orderId))];
        return orderRepository.existingIds(orderIds).then((existing) => {
            const orphaned = files.filter((file) => !existing.has(file.orderId));
            return Promise.all(orphaned.map((file) => deleteCacheFile(root, file.name))).then(
                (results) => results.filter(Boolean).length
            );
        });
    });

/**
 * Deletes every cached file past its TTL — `ops/reap-invoices.ts`'s other sweep, next to
 * {@link reapOrphanedInvoices}. The cache's whole job is to absorb one person's burst; a file
 * older than `invoiceCacheTtlMinutes()` is personal and financial data sitting on disk for
 * nobody, whatever else is true about the order it belongs to — and a stale `.tmp` a crash left
 * behind is not even that, past the same age.
 *
 * @returns how many files were deleted
 */
export const reapExpiredInvoices = (): Promise<number> => {
    const cutoffMs = invoiceCacheTtlMinutes() * 60 * 1000;

    return cachedInvoiceFiles().then(({ root, files }) =>
        Promise.all(
            files.map((file) =>
                stat(path.join(root, file.name)).then((info) =>
                    Date.now() - info.mtimeMs > cutoffMs ? deleteCacheFile(root, file.name) : false
                )
            )
        ).then((results) => results.filter(Boolean).length)
    );
};
