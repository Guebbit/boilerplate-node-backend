/**
 * @module
 * Invoicing — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `invoicingRepository` and both models' runtime
 * stay inside — nothing outside this module writes an invoice or a credit note; they are frozen
 * only from this module's own event listeners.
 *
 * See: docs/modules/invoicing.md
 */

export * from './services';

export * from './emails';

export type * from './model';
