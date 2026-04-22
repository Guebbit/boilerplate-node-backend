import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import { t } from 'i18next';
import { Types } from 'mongoose';
import { userService } from '@services/users';
import { extractId, extractPagination } from '@utils/helpers-request';
import { deleteFile } from '@utils/helpers-filesystem';
import { AuthGuard } from '@nest/guards/auth.guard';
import { AdminGuard } from '@nest/guards/admin.guard';
import { cacheable } from '@nest/decorators/cacheable.decorator';
import { invalidateCache } from '@nest/decorators/invalidate-cache.decorator';
import { CacheResponseInterceptor } from '@nest/interceptors/cache-response.interceptor';
import { InvalidateCacheInterceptor } from '@nest/interceptors/invalidate-cache.interceptor';
import { ok, fail } from '@nest/utils/http';
import type { IRequestContext } from '@nest/types/request-context';
import { parseMultipartImageRequest } from '@nest/utils/multipart';
import { toBooleanFlag } from '@nest/utils/parsing';

/**
 * Admin user-management endpoints.
 */
@Controller('users')
@UseGuards(AuthGuard, AdminGuard)
export class UsersController {
    /**
     * GET /users
     */
    @Get('/')
    @cacheable(3600, ['users'])
    @UseInterceptors(CacheResponseInterceptor)
    async getUsers(@Query() query: Record<string, string>, @Body() body: Record<string, unknown>) {
        const { page, pageSize } = extractPagination({
            page: body.page as string | number | undefined,
            pageSize: body.pageSize as string | number | undefined
        });

        try {
            const result = await userService.search({
                id: extractId(undefined, body.id as string | undefined, query.id as string | undefined),
                text: (body.text as string | undefined) ?? query.text,
                email: (body.email as string | undefined) ?? query.email,
                username: (body.username as string | undefined) ?? query.username,
                page,
                pageSize,
                active:
                    body.active === undefined && query.active === undefined
                        ? undefined
                        : toBooleanFlag(body.active ?? query.active)
            });

            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            fail(500, 'Unknown Error', [String((error as Error).message)]);
        }
    }

    /**
     * POST /users/search
     */
    @Post('/search')
    async searchUsers(@Query() query: Record<string, string>, @Body() body: Record<string, unknown>) {
        return this.getUsers(query, body);
    }

    /**
     * GET /users/:id
     */
    @Get('/:id')
    @cacheable(3600, ['users'])
    @UseInterceptors(CacheResponseInterceptor)
    async getUser(@Param('id') id: string) {
        try {
            const user = await userService.getById(id);
            if (!user) fail(404, 'Not Found', [t('ecommerce.user-not-found')]);
            return ok(user);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'deleteUser - not found', [t('ecommerce.user-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }

    /**
     * POST /users
     */
    @Post('/')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async createUser(@Req() request: IRequestContext) {
        return this.writeUser(request, false);
    }

    /**
     * PUT /users
     */
    @Put('/')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateUserNoId(@Req() request: IRequestContext) {
        return this.writeUser(request, true);
    }

    /**
     * PUT /users/:id
     */
    @Put('/:id')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateUserById(@Req() request: IRequestContext, @Param('id') id: string) {
        return this.writeUser(request, true, id);
    }

    private async writeUser(request: IRequestContext, isUpdate: boolean, pathId?: string) {
        const { body, imageUrlRaw, imageUrl } = await parseMultipartImageRequest(request);
        const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));
        const id = pathId ?? (body.id as string | undefined);

        const payload = {
            ...body,
            imageUrl: imageUrl ?? (body.imageUrl as string | undefined)
        };

        const errors = userService.validateData(payload as never);
        if (errors.length > 0) {
            await deleteUpload();
            fail(422, 'writeUser - validation failed', errors);
        }

        try {
            if (!id) {
                if (isUpdate) {
                    await deleteUpload();
                    fail(422, 'updateUser - missing id', [t('generic.error-missing-data')]);
                }

                const user = await userService.adminCreate(payload as never);
                return ok(user.toObject(), 201);
            }

            const user = await userService.adminUpdate(id, payload as never);
            return ok(user.toObject());
        } catch (error) {
            if (error instanceof HttpException) throw error;
            await deleteUpload();
            if ((error as Error).message === '404')
                fail(404, 'Not Found', [t('ecommerce.user-not-found')]);
            fail(500, 'Internal Server Error', [String((error as Error).message)]);
        }
    }

    /**
     * DELETE /users
     */
    @Delete('/')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteUserNoId(@Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
        return this.deleteUser(undefined, body, query);
    }

    /**
     * DELETE /users/:id
     */
    @Delete('/:id')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteUserById(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Query() query: Record<string, unknown>
    ) {
        return this.deleteUser(id, body, query);
    }

    private async deleteUser(
        id: string | undefined,
        body: Record<string, unknown>,
        query: Record<string, unknown>
    ) {
        const effectiveId = id ?? (body.id as string | undefined);
        const hardDelete = toBooleanFlag(query.hardDelete ?? body.hardDelete);

        if (!effectiveId || !Types.ObjectId.isValid(effectiveId))
            fail(422, 'deleteUser - missing id', [t('generic.error-missing-data')]);
        const targetId = effectiveId as string;

        try {
            const result = await userService.remove(targetId, hardDelete);
            if (!result.success) fail(result.status, result.message, result.errors);
            return ok(undefined, 200, result.message);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'deleteUser - not found', [t('ecommerce.user-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }
}
