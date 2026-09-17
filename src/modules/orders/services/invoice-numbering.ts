/**
 * @module
 * Turning the repository's atomic yearly counter into the invoice number format EU VAT Directive
 * 2006/112/EC Art. 226 wants: `{year}-{sequence}`. The atomicity itself lives behind the
 * repository (`orderRepository.incrementInvoiceCounter`) — this file only decides the string.
 */

import { orderRepository } from '../repository';

/**
 * How wide the sequence portion of an invoice number is padded, e.g. `000041`. Not configurable:
 * EU invoice numbering only requires the number to be sequential and gapless within the year, not
 * a fixed width — a padding-width setting would be a knob with nothing real behind it.
 */
const SEQUENCE_WIDTH = 6;

/**
 * Allocates and formats the next invoice number for the current UTC year —
 * `{year}-{sequence}`, zero-padded to {@link SEQUENCE_WIDTH} digits (e.g. `2026-000041`).
 *
 * Called once, at order-creation time — the caller stores the result on `Order.invoiceNumber` —
 * and never again for the same order, so a re-downloaded invoice always shows the same number. If
 * the order write that follows this call fails, the number allocated here is never reused: a
 * documented, legally-acceptable gap rather than a bug, and no rollback is attempted for it.
 *
 * @returns the formatted invoice number for a new order
 */
export const allocateInvoiceNumber = (): Promise<string> => {
    const year = new Date().getUTCFullYear();

    return orderRepository
        .incrementInvoiceCounter(year)
        .then((sequence) => `${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`);
};
