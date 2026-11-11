/**
 * @module
 * `POST /account/refresh` — the outage branch. A refresh during an outage is a retryable 503, not
 * a 401 (the client reads 401 as "signed out"), and it goes through `rejectDatabaseError` so the
 * outage is logged and marks the trace like every other controller's.
 */

import type { Request } from 'express';
import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import { setEnvironment } from '@tests/environment';
import { logger } from '@infrastructure/adapters/logger';
import { getRefreshToken } from '../../controllers/get-refresh-token';
import { accountService } from '../../services';

/** Mongo's `MaxTimeMSExpired`: the error a query killed at its time limit carries. */
const queryTimeout = () => Object.assign(new Error('operation exceeded time limit'), { code: 50 });

/** The controller driven with a refresh that rejects with `failure`. */
const refreshFailing = async (failure: Error) => {
    jest.spyOn(accountService, 'refreshAccessToken').mockRejectedValue(failure);
    const response = makeResponseStub();
    await getRefreshToken(asStub<Request>({ cookies: {}, headers: {} }), response);
    return response;
};

describe('getRefreshToken — an outage', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('answers a killed query with the 503 QUERY_TIMEOUT item', async () => {
        const response = await refreshFailing(queryTimeout());

        expect(response.status).toHaveBeenCalledWith(503);
        expect(JSON.stringify(response.json.mock.calls[0]![0])).toContain('QUERY_TIMEOUT');
    });

    it('logs the outage under the operation name', async () => {
        await refreshFailing(
            Object.assign(new Error('selection timed out'), { name: 'MongoServerSelectionError' })
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('refreshAccessToken'),
            expect.anything()
        );
    });
});
