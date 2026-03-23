import 'dotenv/config';
import mongoose from "mongoose";
import type { IUser } from "@models/users";
import UserService from "@services/users";
import UserRepository from "@repositories/users";

/**
 * test user factory
 */
const testUser = {
    id: '',
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
        /**
         * Connect to database
         */
        return mongoose
            .connect(process.env.NODE_DB_URI ?? "")
            /**
             * Register the test user
             * (will be created only for this test)
             */
            .then(() => UserService.signup(
                testUser.email,
                testUser.username,
                testUser.password,
                testUser.passwordConfirm
            ))
            /**
             * Remember the id (that is random)
             * so I can delete this user at the end
             */
            .then(({ success, data }) => {
                if (success && data)
                    testUser.id = data.toObject<IUser>()._id.toString()
            });
    });

    /**
     * I still haven't logged with the test user
     */
    it('Test that we are a guest', () => {
        // TODO isGuest YES
        expect(true);
    });

    /**
     * I still haven't logged with the test user
     */
    it('Login and test that we are are an active user', async () => {
        return UserService.login(testUser.email, testUser.password)
            .then((user) => expect(user).toBeTruthy());
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
        return UserRepository.findById(testUser.id)
            .then(user => user ? UserRepository.deleteOne(user) : undefined)

            .finally(() => mongoose.disconnect())
    });
});
