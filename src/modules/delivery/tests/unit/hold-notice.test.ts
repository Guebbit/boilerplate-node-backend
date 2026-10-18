/**
 * @module
 * What a hold means to the buyer: the notice a reason maps to, and when a hold earns a mail.
 * A risk reason must read as the plainest delay, so a notice never reveals a screening result.
 */

import { holdNeedsBuyerNotice, holdNoticeOf } from '../../domain';

describe('holdNoticeOf', () => {
    it.each([
        ['awaiting_stock', 'awaiting_stock'],
        ['incorrect_address', 'check_address'],
        ['high_risk', 'delayed'],
        ['other', 'delayed']
    ] as const)('shows %s to the buyer as %s', (reason, notice) => {
        expect(holdNoticeOf(reason)).toBe(notice);
    });

    it('cannot tell a risk hold from any other reason held for a check', () => {
        expect(holdNoticeOf('high_risk')).toBe(holdNoticeOf('other'));
    });
});

describe('holdNeedsBuyerNotice', () => {
    it.each([
        ['incorrect_address', undefined, true],
        ['high_risk', 'We are checking.', true],
        ['other', 'We are checking.', true],
        ['high_risk', undefined, false],
        ['other', undefined, false],
        ['awaiting_stock', undefined, false],
        ['awaiting_stock', 'Stock is on its way.', false]
    ] as const)('%s with message %s: mailed is %s', (reason, message, mailed) => {
        expect(holdNeedsBuyerNotice(reason, message)).toBe(mailed);
    });
});
