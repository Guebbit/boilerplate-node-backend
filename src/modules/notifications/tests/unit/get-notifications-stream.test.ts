/**
 * @module
 * `GET /notifications/stream` — hands the raw response, the caller's id and a permission recheck to
 * the streamer. The recheck matters most: it is the one place a revoked caller does not lose
 * access on their next request, since there is no next request until it ends the stream. The
 * refusal branch is the fail-closed answer for a request that somehow reached the handler without
 * what `requireSessionViaCookie` sets.
 */

import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { getNotificationsStream } from '@modules/notifications/controllers/get-notifications-stream';
import { notificationsService } from '@modules/notifications/services';
import { stillSignedInViaCookie } from '@kernel/middlewares/authorizations';

jest.mock('@modules/notifications/services', () => ({
    __esModule: true,
    notificationsService: { stream: jest.fn() }
}));

// Only `stillSignedInViaCookie` is replaced — the module's other guards are untouched here.
jest.mock('@kernel/middlewares/authorizations', () => ({
    ...jest.requireActual('@kernel/middlewares/authorizations'),
    __esModule: true,
    stillSignedInViaCookie: jest.fn()
}));

/** What `requireSessionViaCookie` leaves on a request it admitted. */
const admittedRequest = () =>
    asStub<Request>({ sessionRecheck: jest.fn(), authContext: { id: 'user-1' } });

/** A response recording what a refusal answers. */
const makeResponse = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    // A 401 reads and sets its `WWW-Authenticate` challenge before it answers.
    const response = asStub<Response>({
        status,
        hasHeader: jest.fn(() => false),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
        removeHeader: jest.fn()
    });
    return { response, status, json };
};

beforeEach(() => jest.clearAllMocks());

describe('GET /notifications/stream', () => {
    it('hands the response, the caller and a recheck to the streamer, and writes nothing itself', () => {
        const { response, status } = makeResponse();

        getNotificationsStream(admittedRequest(), response);

        // The stream owns the response for its lifetime; anything sent first would end it.
        expect(status).not.toHaveBeenCalled();
        expect(notificationsService.stream).toHaveBeenCalledWith(
            response,
            'user-1',
            expect.any(Function)
        );
    });

    it('wires the recheck to the rule and the request the stream connected with', async () => {
        const request = admittedRequest();
        jest.mocked(stillSignedInViaCookie).mockResolvedValueOnce(true);

        getNotificationsStream(request, makeResponse().response);
        const call = jest.mocked(notificationsService.stream).mock.calls[0] as [
            Response,
            string,
            () => Promise<boolean>
        ];
        await call[2]();

        expect(stillSignedInViaCookie).toHaveBeenCalledWith(request);
    });

    it.each([
        ['no recheck', asStub<Request>({ authContext: { id: 'user-1' } })],
        ['no resolved caller', asStub<Request>({ sessionRecheck: jest.fn() })]
    ])('fails closed with 401 on %s, and opens no stream', (_name, request) => {
        const { response, status, json } = makeResponse();

        getNotificationsStream(request, response);

        expect(status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [
                    expect.objectContaining({
                        code: 'UNAUTHORIZED',
                        message: expect.stringMatching(/\S/) as string
                    })
                ]
            })
        );
        expect(notificationsService.stream).not.toHaveBeenCalled();
    });
});
