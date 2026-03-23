// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import UserService from '@services/users';

/**
 * User Service admin-method unit tests.
 * Validates the service layer (search, getById, validateData, adminCreate/adminUpdate/remove).
 */
describe('User Service (admin methods)', () => {
    /**
     * Tracks the id of any user created during the test run so we can clean up.
     */
    let testUserId: number | undefined;

    /**
     * Sync the database before running tests
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    // ---------------------------------------------------------------------------
    // validateData
    // ---------------------------------------------------------------------------

    it('validateData rejects an empty email', () => {
        const errors = UserService.validateData({
            email: '',
            username: 'validuser',
            password: 'password123',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData rejects an invalid email', () => {
        const errors = UserService.validateData({
            email: 'not-an-email',
            username: 'validuser',
            password: 'password123',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData rejects an empty username', () => {
        const errors = UserService.validateData({
            email: 'test@example.com',
            username: '',
            password: 'password123',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData rejects a username shorter than 3 characters', () => {
        const errors = UserService.validateData({
            email: 'test@example.com',
            username: 'ab',
            password: 'password123',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData rejects a password shorter than 8 characters when required', () => {
        const errors = UserService.validateData({
            email: 'test@example.com',
            username: 'validuser',
            password: 'short',
        }, { requirePassword: true });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData accepts no password when requirePassword is false', () => {
        const errors = UserService.validateData({
            email: 'test@example.com',
            username: 'validuser',
        }, { requirePassword: false });
        expect(errors).toHaveLength(0);
    });

    it('validateData rejects a short password when requirePassword is false but password is provided', () => {
        const errors = UserService.validateData({
            email: 'test@example.com',
            username: 'validuser',
            password: 'short',
        }, { requirePassword: false });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData accepts valid user data', () => {
        const errors = UserService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'password123',
        });
        expect(errors).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // adminCreate
    // ---------------------------------------------------------------------------

    it('adminCreate creates a new user and returns the document', async () => {
        const user = await UserService.adminCreate({
            email: 'admin-test@example.com',
            username: 'AdminTestUser',
            password: 'testpassword1',
            admin: false,
        });
        testUserId = user.id as number;
        expect(user).toBeDefined();
        expect(user.email).toBe('admin-test@example.com');
        expect(user.username).toBe('AdminTestUser');
    });

    // ---------------------------------------------------------------------------
    // search
    // ---------------------------------------------------------------------------

    it('search returns a paginated result object', async () => {
        const result = await UserService.search({ page: 1, pageSize: 5 });
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.meta.page).toBe(1);
        expect(result.meta.pageSize).toBe(5);
    });

    it('search clamps pageSize to max 100', async () => {
        const result = await UserService.search({ page: 1, pageSize: 9999 });
        expect(result.meta.pageSize).toBe(100);
    });

    it('search with text filter finds the created user', async () => {
        const { items } = await UserService.search({ text: 'AdminTestUser' });
        const found = items.some((u) => u.id === testUserId);
        expect(found).toBe(true);
    });

    it('search with email filter finds the created user', async () => {
        const { items } = await UserService.search({ email: 'admin-test@example.com' });
        const found = items.some((u) => u.id === testUserId);
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // getById
    // ---------------------------------------------------------------------------

    it('getById returns undefined for a non-existent id', async () => {
        const user = await UserService.getById(999999);
        expect(user).toBeUndefined();
    });

    it('getById returns undefined for a falsy id', async () => {
        const user = await UserService.getById();
        expect(user).toBeUndefined();
    });

    it('getById returns the user document', async () => {
        const user = await UserService.getById(testUserId);
        expect(user).toBeDefined();
        expect(user!.username).toBe('AdminTestUser');
    });

    // ---------------------------------------------------------------------------
    // adminUpdate
    // ---------------------------------------------------------------------------

    it('adminUpdate updates the user username', async () => {
        const updated = await UserService.adminUpdate(String(testUserId), { username: 'UpdatedUser' });
        expect(updated.username).toBe('UpdatedUser');
    });

    it('adminUpdate sets admin flag', async () => {
        const updated = await UserService.adminUpdate(String(testUserId), { admin: true });
        expect(updated.admin).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // remove (soft & hard)
    // ---------------------------------------------------------------------------

    it('remove soft-deletes a user (sets deletedAt)', async () => {
        const result = await UserService.remove(String(testUserId), false);
        expect(result.success).toBe(true);
        const user = await UserService.getById(testUserId);
        expect(user?.deletedAt).toBeDefined();
    });

    it('remove restores a soft-deleted user (toggles deletedAt off)', async () => {
        const result = await UserService.remove(String(testUserId), false);
        expect(result.success).toBe(true);
        const user = await UserService.getById(testUserId);
        expect(user?.deletedAt).toBeUndefined();
    });

    it('remove returns error for non-existent user', async () => {
        const result = await UserService.remove('999999', false);
        expect(result.success).toBe(false);
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    afterAll(async () => {
        if (testUserId)
            await UserService.remove(String(testUserId), true);
        await sequelize.close();
    });
});
