// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import UserService from '@services/users';
import UserRepository from '@repositories/users';

/**
 * test user factory
 */
const testUser = {
    id: 0,
    email: 'test@test.com',
    username: 'Test',
    password: 'tester@password',
    passwordConfirm: 'tester@password'
};

/**
 * Create a user, login with it,
 * test its authentication and navigate some pages
 */
describe('Auth Controller', () => {
    /**
     * Start of all tests
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });
        /**
         * Register the test user
         * (will be created only for this test)
         */
        const { success, data } = await UserService.signup(
            testUser.email,
            testUser.username,
            testUser.password,
            testUser.passwordConfirm
        );
        if (success && data)
            testUser.id = data.id;
    });

    /**
     * Guest check (not yet logged in)
     */
    it('Test that we are a guest', () => {
        // TODO isGuest YES
        expect(true);
    });

    /**
     * Login and verify it works
     */
    it('Login and test that we are an active user', async () => {
        return UserService.login(testUser.email, testUser.password)
            .then((result) => expect(result).toBeTruthy());
        // TODO mock middleware: isAuth YES & isAdmin NOT
    });

    /**
     *
     */
    it('Navigate some pages', () => {
        // TODO mock controller: isAuth page & isAdmin Page
        expect(true);
    });

    /**
     * End of test
     */
    afterAll(async () => {
        /**
         * Remove the user that has been created only for this test
         */
        if (testUser.id) {
            const user = await UserRepository.findById(testUser.id);
            if (user)
                await UserRepository.deleteOne(user);
        }
        await sequelize.close();
    });
});
