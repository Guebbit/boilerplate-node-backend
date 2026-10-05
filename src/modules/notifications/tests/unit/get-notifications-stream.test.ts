/**
 * @module
 * `GET /notifications/stream` — hands the raw response, the caller's id and a permission recheck to
 * the streamer. The recheck matters most: it is the one place a revoked caller does not lose
 * access on their next request, since there is no next request until it ends the stream. The
 * refusal branch is the fail-closed answer for a request that somehow reached the handler without
 * what `requirePermissionViaCookie` sets.
 */

import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import {
    getNotificationsStream,
    NOTIFICATIONS_READ_KEY
} from '@modules/notifications/controllers/get-notifications-stream';
import { streamNotifications } from '@modules/notifications/services';
import { stillHoldsKeyViaCookie } from '@kernel/middlewares/authorizations';

jest.mock('@modules/notifications/services', () => ({
    __esModule: true,
    streamNotifications: jest.fn()
}));

// Only `stillHoldsKeyViaCookie` is replaced — the module's other guards are untouched here.
jest.mock('@kernel/middlewares/authorizations', () => ({
    ...jest.requireActual('@kernel/middlewares/authorizations'),
    __esModule: true,
    stillHoldsKeyViaCookie: jest.fn()
}));

/** What `requirePermissionViaCookie` leaves on a request it admitted. */
const admittedRequest = () =>
    asStub<Request>({ cookies: { jwt: 'cookie.jwt' }, authContext: { id: 'user-1' } });

/** A response recording what a refusal answers. */
const makeResponse = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { response: asStub<Response>({ status }), status, json };
};

beforeEach(() => jest.clearAllMocks());

describe('GET /notifications/stream', () => {
    it('hands the response, the caller and a recheck to the streamer, and writes nothing itself', () => {
        const { response, status } = makeResponse();

        getNotificationsStream(admittedRequest(), response);

        // The stream owns the response for its lifetime; anything sent first would end it.
        expect(status).not.toHaveBeenCalled();
        expect(streamNotifications).toHaveBeenCalledWith(response, 'user-1', expect.any(Function));
    });

    it('wires the recheck to the same key and the cookie the stream connected with', () => {
        const request = admittedRequest();
        jest.mocked(stillHoldsKeyViaCookie).mockResolvedValueOnce(true);

        getNotificationsStream(request, makeResponse().response);
        const call = jest.mocked(streamNotifications).mock.calls[0] as [
            Response,
            string,
            () => Promise<boolean>
        ];
        void call[2]();

        expect(stillHoldsKeyViaCookie).toHaveBeenCalledWith(
            request,
            'cookie.jwt',
            NOTIFICATIONS_READ_KEY
        );
    });

    it.each([
        ['no refresh cookie', asStub<Request>({ cookies: {}, authContext: { id: 'user-1' } })],
        ['no resolved caller', asStub<Request>({ cookies: { jwt: 'cookie.jwt' } })]
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
        expect(streamNotifications).not.toHaveBeenCalled();
    });
});
