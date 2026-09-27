/**
 * @module
 * The one place a payment document becomes the `Payment` contract. `services/view.ts`'s
 * `withActions` builds on this for the read that also needs `actions` — every write endpoint
 * (confirm, offline, refund, sync, intent) answers with this alone, `actions` being optional on
 * the wire.
 */

import type { Payment } from '@types';
import type { PaymentDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document itself
 * is typed as stored, not as the wire shape `Payment` promises — one cast narrowing what the
 * compiler cannot see through on its own.
 */
export const presentPayment = (document: PaymentDocument): Payment => document.toJSON() as Payment;
