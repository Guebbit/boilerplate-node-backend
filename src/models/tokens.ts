import {
    CreationOptional,
    DataTypes, ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    BelongsToGetAssociationMixin
} from 'sequelize';
import db from "../utils/db";
import Users from "./users";

class Tokens extends Model<InferAttributes<Tokens>, InferCreationAttributes<Tokens>> {
    declare id: CreationOptional<number>;
    declare UserId: ForeignKey<Users['id']>;
    declare type: string;
    declare token: string;
    declare expiration: CreationOptional<number>;

    declare getUser: BelongsToGetAssociationMixin<Users>
}

Tokens.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        token: {
            type: new DataTypes.STRING(),
            allowNull: false
        },
        expiration: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
    },
    {
        sequelize: db,
        tableName: 'tokens'
    }
);

export default Tokens;