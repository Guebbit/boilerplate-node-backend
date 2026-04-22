import {
    Controller,
    Delete,
    Get,
    HttpException,
    Param,
    Post,
    Req,
    Res,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import { t } from 'i18next';
import { userService } from '@services/users';
import {
    createAccessToken,
    createLoggedCookie,
    createRefreshCookie,
    createRefreshToken,
    destroyLoggedCookie,
    destroyRefreshCookie,
    ERefreshTokenExpiryTime
} from '@middlewares/auth-jwt';
import { runTokenCleanup } from '@utils/token-cleanup';
import { userRepository } from '@repositories/users';
import { ETokenType, userModel as Users } from '@models/users';
import { nodemailer } from '@utils/nodemailer';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
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

/**
 * Account/authentication routes.
 */
@Controller('account')
export class AccountController {
    /**
     * GET /account
     */
    @Get('/')
    @UseGuards(AuthGuard)
    @cacheable(3600, ['account'])
    @UseInterceptors(CacheResponseInterceptor)
    account(@Req() request: IRequestContext) {
        return ok(request.user!.toObject());
    }

    /**
     * POST /account/login
     */
    @Post('/login')
    async login(@Req() request: IRequestContext, @Res({ passthrough: true }) response: FastifyReply) {
        const body = (request.body ?? {}) as {
            email?: string;
            password?: string;
            remember?: ERefreshTokenExpiryTime;
        };

        await runTokenCleanup();
        const result = await userService.login(body.email, body.password);

        if (!result.success) fail(result.status, result.message, result.errors);

        const userId = (result.data?._id as Types.ObjectId)?.toString();
        const refreshToken = await createRefreshToken(userId, body.remember);

        // Keep refresh and auth hint cookies aligned with existing login behavior.
        createRefreshCookie(response, refreshToken, body.remember);
        createLoggedCookie(response, body.remember);

        const accessToken = await createAccessToken(refreshToken);
        return ok({ token: accessToken }, 200, 'Authentication successful');
    }

    /**
     * POST /account/signup
     */
    @Post('/signup')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async signup(@Req() request: IRequestContext) {
        const { body, imageUrlRaw, imageUrl } = await parseMultipartImageRequest(request);
        const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

        try {
            const result = await userService.signup(
                String(body.email ?? ''),
                String(body.username ?? ''),
                String(body.password ?? ''),
                String(body.passwordConfirm ?? ''),
                imageUrl ?? ''
            );

            if (!result.success) {
                await deleteUpload();
                fail(result.status, result.message, result.errors);
            }

            return ok(result.data, 201);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const [status, message] = databaseErrorInterpreter(error as Error);
            await deleteUpload();
            fail(status, message);
        }
    }

    /**
     * POST /account/reset
     */
    @Post('/reset')
    async resetRequest(@Req() request: IRequestContext) {
        const body = (request.body ?? {}) as { email?: string };
        const email = body.email;

        await (
            (
                email
                    ? userRepository.findOne({ email }).then((user) =>
                          user
                              ? userService.tokenAdd(user, 'password', 3_600_000).then((token) => ({
                                    username: user.username,
                                    token
                                }))
                              : undefined
                      )
                    : Promise.resolve()
            )
                .catch(() => {})
                .then((data) => {
                    if (data?.token)
                        void nodemailer(
                            {
                                to: email,
                                subject: 'Password reset'
                            },
                            'email-reset-request.ejs',
                            {
                                pageMetaTitle: 'Password reset requested',
                                pageMetaLinks: [],
                                name: data.username,
                                token: data.token
                            }
                        );
                })
        );

        return ok(undefined, 200, t('reset.email-sent'));
    }

    /**
     * POST /account/reset-confirm
     */
    @Post('/reset-confirm')
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async resetConfirm(
        @Req() request: IRequestContext,
        @Res({ passthrough: true }) response: FastifyReply
    ) {
        const body = (request.body ?? {}) as {
            token?: string;
            password?: string;
            passwordConfirm?: string;
        };
        const token = body.token;

        try {
            const user = await userRepository.findOne({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.token': token,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.type': 'password'
            });

            if (!user)
                fail(422, 'reset-confirm - invalid token', [t('reset.token-not-found')]);
            const targetUser = user!;

            const tokenEntry = targetUser.tokens.find(
                (tk) => tk.token === token && tk.type === 'password'
            );
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date()))
                fail(422, 'reset-confirm - expired token', [t('reset.token-not-found')]);

            const result = await userService.passwordChange(
                targetUser,
                String(body.password ?? ''),
                String(body.passwordConfirm ?? '')
            );

            if (!result.success) fail(result.status, result.message, result.errors);

            targetUser.tokens = targetUser.tokens.filter((tk) => tk.token !== token);
            await userRepository.save(targetUser);

            // Confirmation email is fire-and-forget.
            void nodemailer(
                {
                    to: targetUser.email,
                    subject: 'Password change confirmed'
                },
                'email-reset-confirm.ejs',
                {
                    pageMetaTitle: 'Password change confirmed',
                    pageMetaLinks: [],
                    name: targetUser.username
                }
            );

            destroyRefreshCookie(response);
            destroyLoggedCookie(response);

            return ok(undefined, 200, t('reset.success'));
        } catch (error) {
            if (error instanceof HttpException) throw error;
            fail(500, 'Internal Server Error');
        }
    }

    /**
     * GET /account/refresh and GET /account/refresh/:token
     */
    @Get(['/refresh', '/refresh/:token'])
    async refresh(@Req() request: IRequestContext, @Param('token') token?: string) {
        const refreshToken = token ?? (request.cookies as Record<string, string | undefined>)?.jwt;
        if (!refreshToken) fail(401, 'Unauthorized');
        const safeRefreshToken = refreshToken as string;

        await runTokenCleanup();

        try {
            const accessToken = await createAccessToken(safeRefreshToken);
            return ok({ token: accessToken });
        } catch {
            fail(401, 'Unauthorized');
        }
    }

    /**
     * POST /account/logout-all
     */
    @Post('/logout-all')
    @UseGuards(AuthGuard)
    @invalidateCache(['account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async logoutEverywhere(
        @Req() request: IRequestContext,
        @Res({ passthrough: true }) response: FastifyReply
    ) {
        await request.user?.tokenRemoveAll(ETokenType.REFRESH);
        destroyRefreshCookie(response);
        destroyLoggedCookie(response);
        return ok(undefined, 200, 'Logged out from all devices');
    }

    /**
     * DELETE /account/tokens/expired
     */
    @Delete('/tokens/expired')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['users', 'account'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteExpiredTokens() {
        try {
            const result = await Users.tokenRemoveExpired();
            if (!result.success) fail(result.status);
            return ok(undefined, result.status);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const [status, message] = databaseErrorInterpreter(error as Error);
            fail(status, message);
        }
    }
}
