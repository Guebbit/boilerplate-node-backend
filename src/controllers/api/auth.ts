import type { Request, Response, NextFunction } from 'express';
import type { LoginRequest, SignupRequest, PasswordResetRequest, PasswordResetConfirmRequest } from '@api/api';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { generateToken } from '@middlewares/jwt-auth';
import { successResponse, rejectResponse } from '@utils/response';
import { nodemailer } from '@utils/nodemailer';

/**
 * POST /account/login
 * Authenticate user and return JWT token
 */
export const login = async (
    request: Request<unknown, unknown, LoginRequest>,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, password } = request.body;

        const result = await UserService.login(email, password);

        if (!result.success || !result.data) {
            rejectResponse(response, 401, 'Invalid email or password', result.errors);
            return;
        }

        // Generate JWT token
        const token = generateToken(
            result.data._id.toString(),
            result.data.admin || false
        );

        successResponse(response, {
            accessToken: token,
            tokenType: 'Bearer'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /account/signup
 * Register new user and return user data
 */
export const signup = async (
    request: Request<unknown, unknown, SignupRequest>,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, username, password, passwordConfirm, imageUrl } = request.body;

        const result = await UserService.signup(
            email,
            username,
            password,
            passwordConfirm,
            imageUrl
        );

        if (!result.success || !result.data) {
            rejectResponse(response, 422, 'Registration failed', result.errors);
            return;
        }

        // Return created user (without password)
        const userObject = result.data.toObject();
        delete userObject.password;

        successResponse(response, userObject, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /account/reset
 * Initiate password reset flow
 */
export const requestPasswordReset = async (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email } = request.body;

        // Find user by email
        const user = await UserRepository.findOne({ email });

        if (!user) {
            rejectResponse(response, 422, 'Email not found');
            return;
        }

        // Generate password reset token (expires in 24 hours)
        const token = await UserService.tokenAdd(user, 'password', 86_400_000);

        // Send reset email (async, don't wait)
        nodemailer(
            {
                to: email,
                subject: 'Password reset',
            },
            'email-reset-request.ejs',
            {
                pageMetaTitle: 'Password reset requested',
                pageMetaLinks: [],
                name: user.username,
                token,
            }
        );

        successResponse(response, { message: 'Password reset email sent' });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /account/reset-confirm
 * Complete password reset with token
 */
export const confirmPasswordReset = async (
    request: Request<unknown, unknown, PasswordResetConfirmRequest>,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { token, password, passwordConfirm } = request.body;

        // Find user by token
        const user = await UserRepository.findOne({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'tokens.token': token
        });

        if (!user) {
            rejectResponse(response, 422, 'Invalid or expired reset token');
            return;
        }

        // Change password
        const result = await UserService.passwordChange(user, password, passwordConfirm);

        if (!result.success) {
            rejectResponse(response, 422, 'Password change failed', result.errors);
            return;
        }

        // Consume the token (remove it from user's tokens array)
        user.tokens = user.tokens.filter(({ token: t }) => token !== t);
        await UserRepository.save(user);

        // Send confirmation email (async, don't wait)
        nodemailer(
            {
                to: user.email,
                subject: 'Password change confirmed',
            },
            'email-reset-confirm.ejs',
            {
                pageMetaTitle: 'Password change confirmed',
                pageMetaLinks: [],
                name: user.username,
            }
        );

        successResponse(response, { message: 'Password reset successful' });
    } catch (error) {
        next(error);
    }
};
