/**
 * @module
 * Feedback — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). One export: `findOwnTickets`, the single function
 * the account data export needs — everything else this module does (triage, staff search,
 * status transitions) stays internal, since no other module has any business with it.
 *
 * See: docs/modules/feedback.md
 */

export { findOwnTickets } from './service';
