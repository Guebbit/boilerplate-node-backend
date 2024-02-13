import 'dotenv/config';
import { Sequelize } from 'sequelize';

export default new Sequelize(
    process.env.NODE_DB_DATABASE || "",
    process.env.NODE_DB_USERNAME || "",
    process.env.NODE_DB_PASSWORD || "", {
        dialect: 'mysql',
        host: process.env.NODE_DB_LOCALHOST || ""
    });