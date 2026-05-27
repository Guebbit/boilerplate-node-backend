import { connect, disconnect, clearAll } from './database';

/**
 * Standard test lifecycle hooks for repository/service tests using MongoDB.
 * Call at the top level of each test file to eliminate repeated beforeAll/afterAll/beforeEach.
 */
export const setupTestDb = () => {
    beforeAll(connect);
    afterAll(disconnect);
    beforeEach(clearAll);
};
