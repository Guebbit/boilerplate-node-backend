import 'dotenv/config';
// TODO
// import { Sequelize } from 'sequelize';
// import db from '../../src/utils/db';
// import { store, session, flash, userConnect } from "../../src/middlewares/session";
//
// import Users from "../../src/models/users";

/**
 * test user factory
 */
// TODO
// const testUser = {
//     id: 0,
//     email: 'test@test.com',
//     username: 'Test',
//     password: 'tester@password',
//     passwordConfirm: 'tester@password'
// };

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
        // return db
        //     // .sync({ force: true })
        //     .sync()
        //     .then(() => store.sync())
        //     /**
        //      * Register the test user
        //      * (will be created only for this test)
        //      */
        //     .then(() => Users.signup(
        //         testUser.email,
        //         testUser.username,
        //         testUser.password,
        //         testUser.passwordConfirm
        //     ))
        //     /**
        //      * Remember the id (that is random)
        //      * so I can delete this user at the end
        //      */
        //     .then(user => {
        //         // TODO problema con user cart aggregation (eagerloading)
        //         // TODO se risolto, dice "user.createCart is not a function"
        //         testUser.id = user.id
        //     });
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
    it('Login and test that we are are an active user', () => {
        // TODO dopo aver risolto il bug di Signup
        // return Users.login(testUser.email, testUser.password)
        //     .then((user) => expect(user).toBeTruthy());
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
    afterAll(() => {
        /**
         * Remove the user that has been created only for this test
         */
        // TODO
        // return Users.findByPk(testUser.id)
        //     .then(user => user?.destroy())
        //     .finally(() => db.close())
        expect(true);
    });
});
