/**
 * @module
 * Returns service — every operation a controller may call into: opening a return (which is the
 * withdrawal button), staff's answer, receiving the goods and paying back, who sees what, mailing the customer, and the account export's
 * section — one file each.
 */

import { createReturn } from './create';
import { approveReturn, declineReturn } from './decide';
import { receiveReturn } from './receive';
import { closeReturnByHand } from './close';
import { cancelReturn } from './cancel';
import { collectPersonalData } from './personal-data';
import { listReturns, getReturn, withActions } from './read';
import { getReturnOptions } from './options';
import { scrubReturnText } from './retention';
import { mailReturnRequested, mailReturnDecided, mailReturnClosed } from './notify';
import { returnedBuckets, returnedByProduct, returnedSeries } from './stats';
import { returnsDigest } from './digest';

export type { CreateReturnInput, CreateReturnOutcome } from './create';
export type { ReceiveReturnInput } from './receive';
export type { ReturnFilters } from './read';
export type { ReturnedBucket } from './stats';

/** The service's one handle. Named for the record it serves. */
export const returnService = {
    returnsDigest,
    createReturn,
    approveReturn,
    declineReturn,
    receiveReturn,
    closeReturnByHand,
    cancelReturn,
    listReturns,
    getReturn,
    getReturnOptions,
    withActions,
    scrubReturnText,
    returnedBuckets,
    returnedByProduct,
    returnedSeries,
    collectPersonalData,
    mailReturnRequested,
    mailReturnDecided,
    mailReturnClosed
};
