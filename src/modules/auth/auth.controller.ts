import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import { Types } from 'mongoose';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import {
    createRefreshToken,
    createRefreshCookie,
    createLoggedCookie,
    destroyRefreshCookie,
    destroyLoggedCookie,
    createAccessToken,
} from '@middlewares/jwt-auth';
import { successResponse, rejectResponse } from '@utils/response';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';

/**
 * Auth controller – handles account, login, signup, and password-reset routes.
 * Replaces src/controllers/account.ts + src/routes/auth.ts.
 */
@Controller('account')
export class AuthController {
    /**
     * GET /account
     * Returns the full profile of the authenticated user.
     */
    @Get()
    @UseGuards(JwtAuthGuard)
    getAccount(@Req() request: Request, @Res() response: Response): void {
        if (!request.user) {
            rejectResponse(response, 401, 'Unauthorized');
            return;
        }
        successResponse(response, request.user.toObject());
    }

    /**
     * POST /account/login
     * Authenticates a user and returns JWT access token + sets refresh cookie.
     */
    @Post('login')
    async login(@Req() request: Request, @Res() response: Response): Promise<void> {
        const { email, password } = request.body as { email?: string; password?: string };
        const result = await UserService.login(email, password);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        const user = result.data!;
        const userId = (user._id as Types.ObjectId).toString();
        const refreshToken = await createRefreshToken(userId);
        createRefreshCookie(response, refreshToken);
        createLoggedCookie(response);
        const accessToken = await createAccessToken(refreshToken);
        successResponse(response, { token: accessToken });
    }

    /**
     * POST /account/signup
     * Registers a new user account.
     */
    @Post('signup')
    async signup(@Req() request: Request, @Res() response: Response): Promise<void> {
        const { email, username, password, passwordConfirm, imageUrl } = request.body as Record<string, string | undefined>;
        const result = await UserService.signup(
            email ?? '',
            username ?? '',
            password ?? '',
            passwordConfirm ?? '',
            imageUrl,
        );
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, result.data, 201);
    }

    /**
     * POST /account/reset
     * Initiates password-reset flow by sending a one-time token to the email.
     * Always returns 200 to prevent email enumeration.
     */
    @Post('reset')
    async requestPasswordReset(@Req() request: Request, @Res() response: Response): Promise<void> {
        const { email } = request.body as { email?: string };
        try {
            if (email) {
                const user = await UserRepository.findOne({ email });
                if (user)
                    await UserService.tokenAdd(user, 'password', 3_600_000); // 1 hour
            }
        } catch {
            // silent — do not reveal whether the email exists
        }
        successResponse(response, undefined, 200, t('reset.email-sent'));
    }

    /**
     * POST /account/reset-confirm
     * Validates a one-time token and sets the new password.
     */
    @Post('reset-confirm')
    async confirmPasswordReset(@Req() request: Request, @Res() response: Response): Promise<void> {
        const { token, password, passwordConfirm } = request.body as Record<string, string | undefined>;

        if (!token) {
            rejectResponse(response, 422, 'reset-confirm - missing token', [t('generic.error-missing-data')]);
            return;
        }

        try {
            const user = await UserRepository.findOne({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.token': token,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.type': 'password',
            });

            if (!user) {
                rejectResponse(response, 422, 'reset-confirm - invalid token', [t('reset.token-not-found')]);
                return;
            }

            const tokenEntry = user.tokens.find(tk => tk.token === token && tk.type === 'password');
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, 'reset-confirm - expired token', [t('reset.token-not-found')]);
                return;
            }

            const result = await UserService.passwordChange(user, password ?? '', passwordConfirm ?? '');
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            // Consume the token
            user.tokens = user.tokens.filter(tk => tk.token !== token);
            await UserRepository.save(user);

            destroyRefreshCookie(response);
            destroyLoggedCookie(response);
            successResponse(response, undefined, 200, t('reset.success'));
        } catch {
            rejectResponse(response, 500, 'Internal Server Error');
        }
    }
}
