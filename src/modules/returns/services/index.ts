/**
 * @module
 * Returns service — every operation a controller may call into: opening a return (which is the
 * withdrawal button), staff's answer, receiving the goods and paying back, who sees what, mailing the customer, and the account export's
 * section — one file each.
 */

import { createReturn } from './create';
import { approveReturn, declineReturn } from './decide';
import { receiveReturn } from './receive';
import { listReturns, getReturn, withActions } from './read';
import { getReturnOptions } from './options';
import { scrubReturnText } from './retention';
import { returnedBuckets, returnedByProduct, returnedSeries } from './stats';

export { createReturn, type CreateReturnInput, type CreateReturnOutcome } from './create';
export { approveReturn, declineReturn } from './decide';
export { receiveReturn, type ReceiveReturnInput } from './receive';
export { closeReturn } from './close';
export { cancelUnanswered } from './cancel-remainder';
export { listReturns, getReturn, withActions, type ReturnFilters } from './read';
export { getReturnOptions } from './options';
export { collectPersonalData } from './personal-data';
export { scrubReturnText } from './retention';
export type { ReturnedBucket } from './stats';

/** The service's one handle. Named for the record it serves. */
export const returnService = {
    createReturn,
    approveReturn,
    declineReturn,
    receiveReturn,
    listReturns,
    getReturn,
    getReturnOptions,
    withActions,
    scrubReturnText,
    returnedBuckets,
    returnedByProduct,
    returnedSeries
};
