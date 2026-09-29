/**
 * @module
 * Who pays to send the goods back. Read per call, like every getter in this repo, so a deployment
 * corrects it without a restart.
 */

import { environmentChoice } from '@infrastructure/runtime/environment';
import type { ReturnPostagePayer } from './model';

/**
 * Who bears the direct cost of returning the goods. The consumer by default — Consumer Rights
 * Directive Art. 14(1) permits it, IF they were told beforehand, which is why this value also
 * drives the wording of the withdrawal acknowledgement. A deployment that offers free returns
 * sets it to `shop`.
 * @returns `consumer` (default) or `shop`
 */
export const returnPostagePayer = (): ReturnPostagePayer =>
    environmentChoice('NODE_RETURN_POSTAGE_PAYER', ['consumer', 'shop'], 'consumer');
