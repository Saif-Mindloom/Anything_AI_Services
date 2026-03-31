import { DataTypes, Model, Sequelize } from "sequelize";

export class AnythingPick extends Model {
  declare id: number;
  declare userId: number;
  declare outfitId: number;
  declare selectedDate: Date;
  declare weather?: number;
  declare occasion?: string;
  declare reason?: string;
}

export const initAnythingPickModel = (sequelize: Sequelize) => {
  AnythingPick.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "user_id",
      },
      outfitId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "outfit_id",
      },
      selectedDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: "selected_date",
      },
      weather: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      occasion: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AnythingPick",
      tableName: "anything_picks",
      timestamps: true,
      underscored: true,
    },
  );
};

export class UsedAnythingPick extends Model {
  declare id: number;
  declare userId: number;
  declare outfitId: number;
}

export const initUsedAnythingPickModel = (sequelize: Sequelize) => {
  UsedAnythingPick.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "user_id",
      },
      outfitId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "outfit_id",
      },
    },
    {
      sequelize,
      modelName: "UsedAnythingPick",
      tableName: "used_anything_picks",
      timestamps: true,
      underscored: true,
    },
  );
};
