import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import UserRepository from '@repositories/users';
import type { IUserDocument } from '@models/users';

/**
 * User Repository unit tests.
 * Validates every raw CRUD / query method directly against a live MongoDB instance,
 * without going through the service layer.
 *
 * Requires a running MongoDB instance (NODE_DB_URI env var).
 */
describe('User Repository', () => {
    /**
     * The test document created during the run — kept so we can reference
     * and clean it up in subsequent tests and afterAll.
     */
    let testUser: IUserDocument;

    /**
     * Connect to the database before running tests.
     */
    beforeAll(async () => {
        return mongoose.connect(process.env.NODE_DB_URI ?? '');
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
        expect((testUser._id as Types.ObjectId).toString()).toHaveLength(24);
    });

    // ---------------------------------------------------------------------------
    // findById
    // ---------------------------------------------------------------------------

    it('findById returns null for a non-existent ObjectId', async () => {
        const result = await UserRepository.findById('000000000000000000000000');
        expect(result).toBeNull();
    });

    it('findById returns the user document for a valid id', async () => {
        const id     = (testUser._id as Types.ObjectId).toString();
        const result = await UserRepository.findById(id);
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

    it('findAll returns an array of lean documents', async () => {
        const results = await UserRepository.findAll();
        expect(Array.isArray(results)).toBe(true);
    });

    it('findAll respects the limit option', async () => {
        const results = await UserRepository.findAll({}, { limit: 1 });
        expect(results.length).toBeLessThanOrEqual(1);
    });

    it('findAll respects the skip option', async () => {
        const all    = await UserRepository.findAll({ email: 'repo-user-test@example.com' });
        const paged  = await UserRepository.findAll({ email: 'repo-user-test@example.com' }, { skip: all.length });
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
        const id      = (testUser._id as Types.ObjectId).toString();
        const fetched = await UserRepository.findById(id);
        expect(fetched!.username).toBe('RepoUserUpdated');
    });

    // ---------------------------------------------------------------------------
    // updateMany
    // ---------------------------------------------------------------------------

    it('updateMany applies the update to all matching documents', async () => {
        const filter = { email: 'repo-user-test@example.com' };
        await UserRepository.updateMany(filter, { $set: { admin: true } });

        const result = await UserRepository.findOne(filter);
        expect(result!.admin).toBe(true);

        // Restore original value
        await UserRepository.updateMany(filter, { $set: { admin: false } });
    });

    // ---------------------------------------------------------------------------
    // deleteOne
    // ---------------------------------------------------------------------------

    it('deleteOne removes the document from the database', async () => {
        const id = (testUser._id as Types.ObjectId).toString();
        await UserRepository.deleteOne(testUser);

        const result = await UserRepository.findById(id);
        expect(result).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Ensure no leftover test document remains, then disconnect.
     * (The deleteOne test already removes it; this is a safety net.)
     */
    afterAll(async () => {
        await UserRepository.findOne({ email: 'repo-user-test@example.com' })
            .then(user => (user ? UserRepository.deleteOne(user) : undefined));
        return mongoose.disconnect();
    });
});
