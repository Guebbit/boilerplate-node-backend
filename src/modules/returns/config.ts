/**
 * @module
 * Who pays to send the goods back. Read per call, like every getter in this repo, so a test can vary
 * it per case.
 */

import { defineConfig } from '@infrastructure/config/define';
import { choice } from '@infrastructure/config/fields';
import type { ReturnPostagePayer } from './model';

/** Who pays return postage. */
export const returnsConfig = defineConfig({
    name: 'returns',
    shape: {
        NODE_RETURN_POSTAGE_PAYER: choice(['consumer', 'shop'], {
            default: 'consumer',
            describe: 'Who bears the direct cost of returning goods. Drives the withdrawal wording.'
        })
    }
});

/**
 * Who bears the direct cost of returning the goods. The consumer by default — Consumer Rights
 * Directive Art. 14(1) permits it, IF they were told beforehand, which is why this value also
 * drives the wording of the withdrawal acknowledgement. A deployment that offers free returns
 * sets it to `shop`.
 * @returns `consumer` (default) or `shop`
 */
export const returnPostagePayer = (): ReturnPostagePayer =>
    returnsConfig().NODE_RETURN_POSTAGE_PAYER;
