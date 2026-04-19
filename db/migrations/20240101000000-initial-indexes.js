/** @type {import('migrate-mongo').MigrationFunctions} */
module.exports = {
    async up(db) {
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('products').createIndex({ active: 1 });
        await db.collection('products').createIndex({ deletedAt: 1 });
        await db.collection('orders').createIndex({ userId: 1 });
    },

    async down(db) {
        await db.collection('users').dropIndex('email_1');
        await db.collection('users').dropIndex('username_1');
        await db.collection('products').dropIndex('active_1');
        await db.collection('products').dropIndex('deletedAt_1');
        await db.collection('orders').dropIndex('userId_1');
    }
};
