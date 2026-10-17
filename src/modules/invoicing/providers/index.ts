/**
 * @module
 * The e-invoicing port — the seam a national e-invoicing network plugs into. Which implementation
 * answers is a deployment decision (`NODE_EINVOICING_PROVIDER`), not a code path — shaped after
 * `payments/providers`: one interface, one shipped implementation (`pdf`), and a live deployment
 * adds a file plus one line to the registry below.
 *
 * `pdf` is the only implementation this boilerplate ships. Italy's SdI and the EU's Peppol network
 * are NOT built here — they are integrations: unlike a PDF, both transmit a structured document to
 * a third party and get back a delivery outcome, so a real adapter's `issue` would also have to
 * report that outcome back onto the document (a transmission id, a rejection reason). That shape
 * is deliberately left for whoever builds the first one, rather than guessed at here.
 */

import { createProviderRegistry, requireProvider } from '@infrastructure/runtime/provider-registry';
import { defineProbe } from '@infrastructure/config/define';
import { invoicingConfig } from '../config';
import { pdfEInvoicingProvider } from './pdf';
import type { FrozenTaxDocument } from '../model';

/** Which kind of document is being issued — each prints under its own title and disclaimer. */
export type EInvoicingDocumentKind = 'invoice' | 'creditNote';

/**
 * Everything a provider needs to issue one document — the same frozen fields `model.ts`'s
 * `FrozenTaxDocument` persists, plus the printed number and which kind of document this is. Never
 * the Mongoose document itself: a provider must not be able to reach the database.
 */
export type EInvoicingDocument = Omit<FrozenTaxDocument, 'orderId'> & {
    kind: EInvoicingDocumentKind;
    /** Present only on a credit note — the invoice it reverses. */
    reversalOf?: { number: string };
};

/** What an implementation must provide. */
export interface EInvoicingProvider {
    /** The name this provider identifies itself by — for logs, never persisted onto a document today. */
    name: string;

    /**
     * Turn a frozen document into the PDF the buyer downloads. A real SdI/Peppol adapter would
     * also transmit its XML to the authority; the buyer's copy stays a PDF.
     * @param document - every frozen field the document was issued with
     * @returns the PDF's bytes
     */
    issue(document: EInvoicingDocument): Promise<Buffer>;
}

/**
 * Every implementation this build knows. A new provider is one adapter file plus one entry here.
 */
const registry = createProviderRegistry<EInvoicingProvider>({
    pdf: pdfEInvoicingProvider
});

/**
 * The configured e-invoicing provider, read fresh per call rather than memoised — the same
 * reasoning `payments/providers#resolvePaymentProvider` gives for its own registry.
 * @returns the implementation `NODE_EINVOICING_PROVIDER` names (default `pdf`)
 * @throws {Error} when the variable names an implementation this build does not have
 */
export const resolveEInvoicingProvider = (): EInvoicingProvider => {
    return requireProvider(
        registry,
        'NODE_EINVOICING_PROVIDER',
        invoicingConfig().NODE_EINVOICING_PROVIDER
    );
};

/**
 * Boot probe for `NODE_EINVOICING_PROVIDER`: a typo would otherwise throw on the first invoice. A
 * shape-less slice, because the resolver imports the config and the config therefore cannot
 * import the resolver.
 */
export const invoicingProviderProbe = defineProbe('invoicing-provider', resolveEInvoicingProvider);
