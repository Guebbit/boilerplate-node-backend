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

export { createReturn, type CreateReturnInput, type CreateReturnOutcome } from './create';
export { approveReturn, declineReturn } from './decide';
export { receiveReturn, type ReceiveReturnInput } from './receive';
export { closeReturn } from './close';
export { listReturns, getReturn, withActions, type ReturnFilters } from './read';
export { collectPersonalData } from './personal-data';

/** The service's one handle. Named for the record it serves. */
export const returnService = {
    createReturn,
    approveReturn,
    declineReturn,
    receiveReturn,
    listReturns,
    getReturn,
    withActions
};
