/**
 * @module
 * `GET /observability/events` — hands the raw response and a permission recheck to the SSE
 * streamer. The recheck matters most: it is the one place a revoked caller does not lose access on
 * their very next request, since there is no next request until it ends the stream.
 */

import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { getObservabilityEvents } from '@modules/observability/controllers/get-observability-events';
import { streamObservabilityMetrics } from '@modules/observability/services/stream';
import { stillHoldsRuleViaCookie } from '@kernel/middlewares/authorizations';

jest.mock('@modules/observability/services/stream', () => ({
    __esModule: true,
    streamObservabilityMetrics: jest.fn()
}));

// Only `stillHoldsRuleViaCookie` is replaced — the module's other guards are untouched here.
jest.mock('@kernel/middlewares/authorizations', () => ({
    ...jest.requireActual('@kernel/middlewares/authorizations'),
    __esModule: true,
    stillHoldsRuleViaCookie: jest.fn()
}));

/** What `requirePermissionViaCookie` leaves behind once it admitted the caller. */
const cookieRequest = () => asStub<Request>({ sessionRecheck: jest.fn() });

beforeEach(() => jest.clearAllMocks());

describe('GET /observability/events', () => {
    it('hands the raw response and a recheck to the streamer, and writes nothing itself', () => {
        const response = asStub<Response>({});

        getObservabilityEvents(cookieRequest(), response);

        // SSE owns the response for its lifetime: headers, keep-alives and the close. Anything
        // this handler sent first would end the stream before it began.
        expect(streamObservabilityMetrics).toHaveBeenCalledWith(response, expect.any(Function));
    });

    it('wires the recheck to the key and the request the stream connected with', () => {
        const response = asStub<Response>({});
        const request = cookieRequest();
        jest.mocked(stillHoldsRuleViaCookie).mockResolvedValueOnce(true);

        getObservabilityEvents(request, response);
        const [, recheck] = jest.mocked(streamObservabilityMetrics).mock.calls[0] as [
            Response,
            () => Promise<boolean>
        ];
        void recheck();

        expect(stillHoldsRuleViaCookie).toHaveBeenCalledWith(
            request,
            'read',
            'ObservabilitySnapshot'
        );
    });
});
