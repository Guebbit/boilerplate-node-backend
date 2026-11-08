/**
 * @module
 * How an invoice document is issued. The seller's own identity (legal name, VAT number, address)
 * lives in `account` (`services/operator-identity.ts`). Read per call, so a test can vary it per
 * case.
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** How the invoice document is issued. */
export const invoicingConfig = defineConfig({
    name: 'invoicing',
    shape: {
        NODE_EINVOICING_PROVIDER: text({ default: 'pdf', case: 'lower' }),
        NODE_INVOICE_PDF_RETENTION_DAYS: int({ default: 30, min: 0 }),
        // Years after the end of the issue year that the buyer block stays on a document.
        NODE_INVOICE_BUYER_RETENTION_YEARS: int({ default: 10, min: 1 })
    }
});
