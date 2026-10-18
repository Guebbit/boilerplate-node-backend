/**
 * @module
 * The shop's closed vocabularies.
 */

import { ShopReturnPostagePayer } from '@types';

/** Who pays to send returned goods back — the contract's own enum, so the two cannot drift. */
export const RETURN_POSTAGE_PAYERS: readonly ShopReturnPostagePayer[] =
    Object.values(ShopReturnPostagePayer);

/** Who pays to send returned goods back: the customer, or the shop. */
export type ReturnPostagePayer = ShopReturnPostagePayer;
