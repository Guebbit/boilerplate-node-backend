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

import { environmentChoice } from '@infrastructure/runtime/environment';
import { pdfEInvoicingProvider } from './pdf';
import type { InvoiceLine, InvoiceParty, InvoiceSeller } from '../model';
import type { OrderTaxSummaryRow } from '@types';

/** Which kind of document is being issued — each prints under its own title and disclaimer. */
export type EInvoicingDocumentKind = 'invoice' | 'creditNote';

/**
 * Everything a provider needs to issue one document — the same frozen fields `model.ts`'s
 * `FrozenTaxDocument` persists, plus the printed number and which kind of document this is. Never
 * the Mongoose document itself: a provider must not be able to reach the database.
 */
export interface EInvoicingDocument {
    kind: EInvoicingDocumentKind;
    number: string;
    issuedAt: Date;
    currency: string;
    locale: string;
    orderNumber?: string;
    billingAddress?: InvoiceParty;
    seller: InvoiceSeller;
    lines: InvoiceLine[];
    shippingCost?: number;
    netTotal: number;
    taxTotal: number;
    shippingNetAmount: number;
    shippingTaxAmount: number;
    taxSummary: OrderTaxSummaryRow[];
    shippingByRate: OrderTaxSummaryRow[];
    grandTotal: number;
    /** Present only on a credit note — the invoice it reverses. */
    reversalOf?: { number: string };
}

/** What issuing a document hands back — bytes, and the media type they are. */
export interface EInvoicingArtifact {
    contentType: string;
    bytes: Buffer;
}

/** What an implementation must provide. */
export interface EInvoicingProvider {
    /** The name this provider identifies itself by — for logs, never persisted onto a document today. */
    name: string;

    /**
     * Turn a frozen document into its durable artefact — a rendered PDF today; a real SdI/Peppol
     * adapter would transmit an XML payload instead and hand back whatever it gets in return.
     * @param document - every frozen field the document was issued with
     */
    issue(document: EInvoicingDocument): Promise<EInvoicingArtifact>;
}

/** Every implementation this build knows. A real deployment adds one file and one line here. */
const PROVIDERS: Record<string, EInvoicingProvider | undefined> = {
    pdf: pdfEInvoicingProvider
};

/**
 * The configured e-invoicing provider, read fresh per call rather than memoised — the same
 * reasoning `payments/providers#resolvePaymentProvider` gives for its own registry.
 * @returns the implementation `NODE_EINVOICING_PROVIDER` names (default `pdf`)
 * @throws {Error} when the variable names an implementation this build does not have
 */
export const resolveEInvoicingProvider = (): EInvoicingProvider => {
    const name = environmentChoice('NODE_EINVOICING_PROVIDER', Object.keys(PROVIDERS), 'pdf');
    // `environmentChoice` only ever returns `fallback` or a member of `allowed` — both are keys
    // of PROVIDERS by construction, a guarantee the compiler cannot follow across the call.
    return PROVIDERS[name]!;
};
