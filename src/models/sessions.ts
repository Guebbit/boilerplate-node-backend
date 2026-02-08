import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model
} from 'sequelize';
import database from "../utils/database";

class Sessions extends Model<InferAttributes<Sessions>, InferCreationAttributes<Sessions>> {
    declare sid: CreationOptional<number>;
    declare expires: Date;
    declare data: Date;
}

Sessions.init(
    {
        sid: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        expires: DataTypes.DATE,
        data: DataTypes.STRING(50_000)
    },
    {
        sequelize: database,
        tableName: 'sessions'
    }
);

export default Sessions;