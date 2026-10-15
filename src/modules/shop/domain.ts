/**
 * @module
 * The shop's closed vocabularies.
 */

/** Who pays to send returned goods back. */
export const RETURN_POSTAGE_PAYERS = ['consumer', 'shop'] as const;

/** Who pays to send returned goods back: the customer, or the shop. */
export type ReturnPostagePayer = (typeof RETURN_POSTAGE_PAYERS)[number];
