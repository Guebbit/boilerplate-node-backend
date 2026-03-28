import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from './schema';
import resolvers from './resolvers';
import { buildContext } from './context';

/**
 * graphql-yoga instance.
 * Mount this in Express with: `app.use(yoga.graphqlEndpoint, yoga)`
 */
export const yoga = createYoga({
    schema: createSchema({
        typeDefs,
        resolvers,
    }),
    context: buildContext,
    /**
     * Expose the GraphiQL IDE only outside production.
     */
    graphiql: process.env.NODE_ENV !== 'production',
    /**
     * Ensure yoga logs to the existing Winston logger.
     * graphql-yoga logs at debug level by default; setting to false suppresses its
     * own output so that our global Express logger stays the single source of truth.
     */
    logging: false,
});

export default yoga;
