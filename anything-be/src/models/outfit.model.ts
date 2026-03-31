import { DataTypes, Model, Sequelize } from "sequelize";

export class Outfit extends Model {
  declare id: number;
  declare userId: number;
  declare topId: number;
  declare bottomId: number;
  declare shoeId: number;
  declare dressId: number;
  declare outerwearId: number;
  declare primaryImageUrl?: string;
  declare gsUtil?: string;
  declare imageList?: any;
  declare poseLeft?: string;
  declare poseRight?: string;
  declare rating?: number;
  declare visible: boolean;
  declare favourite: boolean;
  declare hasAccessories: boolean;
  declare accessoryIds: number[];
  declare outfitSummary?: string;
  declare accessoriesSummary?: string;
}

export const initOutfitModel = (sequelize: Sequelize) => {
  Outfit.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "user_id", // Map to snake_case database column
      },
      topId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "top_id", // Map to snake_case database column
      },
      bottomId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "bottom_id", // Map to snake_case database column
      },
      shoeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "shoe_id", // Map to snake_case database column
      },
      dressId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "dress_id",
      },
      outerwearId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "outerwear_id",
      },
      primaryImageUrl: {
        type: DataTypes.TEXT,
        field: "primary_image_url", // Map to snake_case database column
      },
      gsUtil: {
        type: DataTypes.TEXT,
        field: "gs_util", // Map to snake_case database column
      },
      imageList: {
        type: DataTypes.JSON,
        field: "image_list", // Map to snake_case database column
      },
      poseLeft: {
        type: DataTypes.TEXT,
        field: "pose_left", // Map to snake_case database column
      },
      poseRight: {
        type: DataTypes.TEXT,
        field: "pose_right", // Map to snake_case database column
      },
      rating: { type: DataTypes.FLOAT },
      visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      favourite: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      hasAccessories: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "has_accessories",
      },
      accessoryIds: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: false,
        defaultValue: [],
        field: "accessory_ids",
      },
      outfitSummary: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "outfit_summary",
      },
      accessoriesSummary: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "accessories_summary",
      },
    },
    {
      sequelize,
      modelName: "Outfit",
      tableName: "outfits",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
    },
  );
};
