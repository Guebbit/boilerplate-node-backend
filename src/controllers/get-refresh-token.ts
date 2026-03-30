import type { Request, Response } from 'express';
import { createAccessToken } from '@middlewares/auth-jwt';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * Page GET data
 */
export interface IGetResetConfirmPostData {
    token?: string,
}


/**
 * GET /account/refresh
 * Refresh access token.
 * Given the refreshToken from the URL or, if not, from the user cookies:
 * create a new short-lived access token for the following requests.
 */
const getRefreshToken = (request: Request<IGetResetConfirmPostData>, response: Response) => {

    /**
     * Get token
     * (name of the cookie decided in the post-login.ts controller)
     */
    const refreshToken = request.params.token ?? (request.cookies as Record<string, string | undefined>).jwt;

    /**
     * Check if refresh token is missing
     */
    if (!refreshToken) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    /**
     * Create new access token using refresh token stored in the server
     */
    createAccessToken(refreshToken)
        .then(token => successResponse(response, { token }))
        .catch(() => rejectResponse(response, 401, 'Unauthorized'));
};

export default getRefreshToken;

