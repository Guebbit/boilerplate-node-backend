/**
 * @module
 * The document store: finished PDFs (an invoice, a credit note) kept on disk for a while, so a
 * second download streams a file instead of launching Chromium again.
 *
 * What it is NOT: a record. The frozen invoice DATA in Mongo is the legal record; a stored PDF is
 * a regenerable copy, never backed up, and gone after its retention window. A PDF rendered again
 * after its file was reaped follows the CURRENT template, so a template change can change how an
 * old invoice looks; the numbers it prints do not change.
 *
 * Private: OUTSIDE `NODE_PUBLIC_PATH` (it holds personal and financial data), and a name that does
 * not match the one shape this store writes is never joined onto a path at all. Plaintext on disk,
 * on purpose and in writing: at-rest protection is the host's, like the Mongo data files
 * (`docs/theory/defences/data-protection.md`).
 *
 * See: docs/modules/invoicing.md
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { reapDirectory, unlinkIfPresent, type ReapResult } from './filesystem';
import { pdfConfig } from '@infrastructure/adapters/config';

/** Where stored documents live. Mount a volume here in a deployment; the default is dev-only. */
const documentRoot = (): string => path.resolve(pdfConfig().NODE_DOCUMENT_STORE_PATH);

/**
 * The only name shape this store reads or writes: a short slug and `.pdf`. Never a path, so
 * nothing a caller passes can name a file outside the root.
 */
const NAME_PATTERN = /^[\w-]{1,80}\.pdf$/;

/**
 * Resolve a stored document's name to a path inside the root, or `undefined` for a name that is
 * not of the shape this store writes.
 *
 * @param name - the document's name, e.g. `invoice-<id>.pdf`
 */
const resolveName = (name: string): string | undefined =>
    NAME_PATTERN.test(name) ? path.join(documentRoot(), name) : undefined;

/**
 * Read a stored document.
 *
 * @param name - the document's name
 * @returns its bytes, or `undefined` when none is stored (or the name is not one this store writes)
 */
export const readDocument = (name: string): Promise<Buffer | undefined> => {
    const target = resolveName(name);
    if (!target) return Promise.resolve(undefined);

    return readFile(target).then(
        (bytes) => bytes,
        (error: unknown) => {
            // Absent is the ordinary case (never stored, or reaped); anything else is a real fault.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
        }
    );
};

/**
 * Store a document, atomically: written to a temporary file in the same directory, then renamed
 * over the final name. A reader (or a second download rendering the same bytes at the same moment)
 * sees either no file or a whole one, never half of one.
 *
 * @param name - the document's name
 * @param bytes - the finished PDF
 * @throws {Error} for a name this store would not write, or a failed write
 */
export const writeDocument = (name: string, bytes: Buffer | Uint8Array): Promise<void> => {
    const target = resolveName(name);
    if (!target) return Promise.reject(new Error(`Not a storable document name: ${name}`));

    // Random suffix, so two simultaneous first downloads write their own temp file.
    const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    return mkdir(documentRoot(), { recursive: true })
        .then(() => writeFile(temporary, bytes))
        .then(() => rename(temporary, target))
        .catch((error: unknown) =>
            // A failed write must not leave its temporary file behind.
            unlinkIfPresent(temporary, 'Could not remove a temporary document.', { name }).then(
                () => {
                    throw error;
                }
            )
        );
};

/**
 * Delete every stored document last modified at or before the retention window's edge — the
 * nightly `reap:invoice-pdfs` job. By modification time, so a document is kept from the moment it
 * was rendered, not from its last download.
 *
 * @param retentionMs - how long a document may stay
 * @returns how many files were checked and deleted
 */
export const reapDocuments = (retentionMs: number): Promise<ReapResult> =>
    reapDirectory(documentRoot(), Date.now() - retentionMs, 'Stored document');
