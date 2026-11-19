/**
 * @module
 * The e-invoicing port — the seam a national e-invoicing network plugs into. Which implementation
 * answers is a deployment decision (`NODE_EINVOICING_PROVIDER`), not a code path — shaped after
 * `payments/providers`: one interface, one shipped implementation (`pdf`), and a live deployment
 * adds a file plus one line to the registry below.
 *
 * `pdf` is the only implementation this boilerplate ships. Italy's SdI and the EU's Peppol network
 * are NOT built here. The port renders only the buyer's copy. Transmitting to an authority is a
 * separate one-time step at issue time (`services/issue-invoice.ts`, `issue-credit-note.ts`),
 * designed by the first adapter, with its outcome (a transmission id, a rejection reason) reported
 * back onto the document.
 */

import { createProviderRegistry, requireProvider } from '@infrastructure/runtime/provider-registry';
import { defineProbe } from '@infrastructure/config/define';
import { invoicingConfig } from '../config';
import { pdfEInvoicingProvider } from './pdf';
import type { CreditNoteReason, FrozenTaxDocument } from '../model';

/** Which kind of document is being issued — each prints under its own title and disclaimer. */
export type EInvoicingDocumentKind = 'invoice' | 'creditNote';

/**
 * Everything a provider needs to render one document — the same frozen fields `model.ts`'s
 * `FrozenTaxDocument` persists, plus the printed number and which kind of document this is. Never
 * the Mongoose document itself: a provider must not be able to reach the database.
 */
export type EInvoicingDocument = Omit<FrozenTaxDocument, 'orderId'> & {
    kind: EInvoicingDocumentKind;
    /** Present only on a credit note — the invoice it reverses, and why. */
    reversalOf?: { number: string; reason: CreditNoteReason };
};

/** What an implementation must provide. */
export interface EInvoicingProvider {
    /** The name this provider identifies itself by — for logs, never persisted onto a document today. */
    name: string;

    /**
     * Turn a frozen document into the PDF the buyer downloads. Must be a pure render, safe to
     * repeat: it runs on every download that finds no stored copy. Never transmit from here.
     * @param document - every frozen field the document was issued with
     * @returns the PDF's bytes
     */
    render(document: EInvoicingDocument): Promise<Buffer>;
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
