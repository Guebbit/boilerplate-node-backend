import { Store } from "express-session";
import { Sequelize } from "sequelize";

declare module "connect-session-sequelize" {
     
    interface SequelizeStoreOptions {
        db: Sequelize;
        tableName?: string;
        extendDefaultFields?: (
            defaults: { data: string; expires: Date },
            session: Record<string, unknown>
        ) => Record<string, unknown>;
    }

    export default function (
        store: typeof Store
    ): new (options: SequelizeStoreOptions) => Store;
}