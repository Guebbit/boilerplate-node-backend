import type {Request, Response} from 'express';
import type {CastError} from "mongoose";
import {generateReject, rejectResponse, successResponse} from "../../utils/response";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import Users from "../../models/users";


/**
 * Refresh access token
 * Given the refreshToken from the URL or, if not, from the user cookies:
 * create a new short-lived access token for the following requests
 */
export default async (req: Request, res: Response) => {
    /**
     * Create new access token using refresh token stored in the server
     */
    await Users.tokenRemoveExpired()
        .then(({status, success}) => {
                if (!success)
                    return rejectResponse(res, status);
            return successResponse(res, undefined, status)
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
};
