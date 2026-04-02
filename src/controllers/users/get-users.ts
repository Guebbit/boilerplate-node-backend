import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@types';

export type IGetUsersQuery = Partial<Record<keyof SearchUsersRequest, string>>;

export const getUsers = (
    request: Request<{ page?: string }, unknown, SearchUsersRequest, IGetUsersQuery>,
    response: Response
) => {
    const page = request.body.page ?? request.query.page ?? '1';
    const pageSize =
        request.body.pageSize ??
        request.query.pageSize ??
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ??
        '10';

    const active =
        request.body.active ?? request.query.active
            ? (request.body.active ?? request.query.active) === 'true'
            : undefined;

    return userService
        .search({
            id: request.body.id ?? request.query.id,
            text: request.body.text ?? request.query.text,
            email: request.body.email ?? request.query.email,
            username: request.body.username ?? request.query.username,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            active
        })
        .then((result) => {
            successResponse(response, result);
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
