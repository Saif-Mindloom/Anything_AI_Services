import { DataTypes, Model, Sequelize } from "sequelize";

export class Accessory extends Model {
  declare id: number;
  declare outfitId: number;
  declare accessoryType: string;
  declare description?: string;
  declare imageUrl?: string;
  declare gsUtil?: string;
  declare status: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export const initAccessoryModel = (sequelize: Sequelize) => {
  Accessory.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      outfitId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "outfit_id",
        references: {
          model: "outfits",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      accessoryType: {
        type: DataTypes.ENUM(
          "headwear",
          "eyewear",
          "necklace",
          "chain",
          "scarf",
          "ring",
          "bracelet",
          "watch",
          "belt",
          "bag",
          "earings",
        ),
        allowNull: false,
        field: "accessory_type",
      },
      description: {
        type: DataTypes.TEXT,
      },
      imageUrl: {
        type: DataTypes.TEXT,
        field: "image_url",
      },
      gsUtil: {
        type: DataTypes.TEXT,
        field: "gs_util",
      },
      status: {
        type: DataTypes.ENUM("pending", "complete", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      sequelize,
      modelName: "Accessory",
      tableName: "accessories",
      timestamps: true,
      underscored: true,
    },
  );
};
