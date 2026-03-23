// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import UserRepository from '@repositories/users';
import type { IUserDocument } from '@models/users';

/**
 * User Repository unit tests.
 * Validates every raw CRUD / query method against an in-memory SQLite database,
 * without going through the service layer.
 */
describe('User Repository', () => {
    /**
     * The test document created during the run — kept so we can reference
     * and clean it up in subsequent tests and afterAll.
     */
    let testUser: IUserDocument;

    /**
     * Sync the database schema before running tests.
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    // ---------------------------------------------------------------------------
    // create
    // ---------------------------------------------------------------------------

    it('create inserts a new user document and returns it', async () => {
        testUser = await UserRepository.create({
            email:    'repo-user-test@example.com',
            username: 'RepoUserTest',
            // Password is stored as plain text at the repository layer;
            // hashing is a service/model-hook concern.
            password: 'plainpassword123',
            admin:    false,
        });
        expect(testUser).toBeDefined();
        expect(testUser.email).toBe('repo-user-test@example.com');
        expect(testUser.username).toBe('RepoUserTest');
        expect(typeof testUser.id).toBe('number');
        expect(testUser.id).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------------
    // findById
    // ---------------------------------------------------------------------------

    it('findById returns null for a non-existent id', async () => {
        const result = await UserRepository.findById(999999);
        expect(result).toBeNull();
    });

    it('findById returns the user document for a valid id', async () => {
        const result = await UserRepository.findById(testUser.id);
        expect(result).not.toBeNull();
        expect(result!.email).toBe('repo-user-test@example.com');
    });

    // ---------------------------------------------------------------------------
    // findOne
    // ---------------------------------------------------------------------------

    it('findOne returns null when no document matches the filter', async () => {
        const result = await UserRepository.findOne({ email: 'no-match@example.com' });
        expect(result).toBeNull();
    });

    it('findOne returns the matching user document', async () => {
        const result = await UserRepository.findOne({ email: 'repo-user-test@example.com' });
        expect(result).not.toBeNull();
        expect(result!.username).toBe('RepoUserTest');
    });

    // ---------------------------------------------------------------------------
    // findAll
    // ---------------------------------------------------------------------------

    it('findAll returns an array of documents', async () => {
        const results = await UserRepository.findAll();
        expect(Array.isArray(results)).toBe(true);
    });

    it('findAll respects the limit option', async () => {
        const results = await UserRepository.findAll({}, { limit: 1 });
        expect(results.length).toBeLessThanOrEqual(1);
    });

    it('findAll respects the skip option', async () => {
        const all   = await UserRepository.findAll({ email: 'repo-user-test@example.com' });
        const paged = await UserRepository.findAll({ email: 'repo-user-test@example.com' }, { skip: all.length });
        expect(paged.length).toBe(0);
    });

    it('findAll filters results by a where clause', async () => {
        const results = await UserRepository.findAll({ email: 'repo-user-test@example.com' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].email).toBe('repo-user-test@example.com');
    });

    // ---------------------------------------------------------------------------
    // count
    // ---------------------------------------------------------------------------

    it('count returns 0 for a non-matching filter', async () => {
        const n = await UserRepository.count({ email: 'nobody@example.com' });
        expect(n).toBe(0);
    });

    it('count returns the correct number of matching documents', async () => {
        const n = await UserRepository.count({ email: 'repo-user-test@example.com' });
        expect(n).toBe(1);
    });

    // ---------------------------------------------------------------------------
    // save
    // ---------------------------------------------------------------------------

    it('save persists field changes to the document', async () => {
        testUser.username = 'RepoUserUpdated';
        const saved = await UserRepository.save(testUser);
        expect(saved.username).toBe('RepoUserUpdated');

        // Confirm the change is reflected in a subsequent database read
        const fetched = await UserRepository.findById(testUser.id);
        expect(fetched!.username).toBe('RepoUserUpdated');
    });

    // ---------------------------------------------------------------------------
    // updateMany
    // ---------------------------------------------------------------------------

    it('updateMany applies the update to all matching documents', async () => {
        const filter = { email: 'repo-user-test@example.com' };
        await UserRepository.updateMany(filter, { admin: true });

        const result = await UserRepository.findOne(filter);
        expect(result!.admin).toBe(true);

        // Restore original value
        await UserRepository.updateMany(filter, { admin: false });
    });

    // ---------------------------------------------------------------------------
    // deleteOne
    // ---------------------------------------------------------------------------

    it('deleteOne removes the document from the database', async () => {
        const id = testUser.id;
        await UserRepository.deleteOne(testUser);

        const result = await UserRepository.findById(id);
        expect(result).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Ensure no leftover test document remains, then close the connection.
     * (The deleteOne test already removes it; this is a safety net.)
     */
    afterAll(async () => {
        await UserRepository.findOne({ email: 'repo-user-test@example.com' })
            .then(user => (user ? UserRepository.deleteOne(user) : undefined));
        await sequelize.close();
    });
});
