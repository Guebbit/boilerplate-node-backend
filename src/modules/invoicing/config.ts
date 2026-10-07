/**
 * @module
 * How an invoice document is issued. The seller's own identity (legal name, VAT number, address)
 * lives in `@modules/orders`' `config.ts`: the withdrawal notice prints it too, and `orders` cannot
 * import this module. Read per call, so a test can vary it per case.
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** How the invoice document is issued. */
export const invoicingConfig = defineConfig({
    name: 'invoicing',
    shape: {
        NODE_EINVOICING_PROVIDER: text({ default: 'pdf', case: 'lower' }),
        NODE_INVOICE_PDF_RETENTION_DAYS: int({ default: 30, min: 0 })
    }
});
