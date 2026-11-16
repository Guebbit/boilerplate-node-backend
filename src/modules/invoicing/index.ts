/**
 * @module
 * Invoicing — public barrel; the only surface a sibling module may import (the rule
 * is linked below). `invoicingRepository` and both models' runtime
 * stay inside — nothing outside this module writes an invoice or a credit note; they are frozen
 * only from this module's own event listeners.
 *
 * @see docs/modules/invoicing.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export * from './emails';

export type * from './model';
