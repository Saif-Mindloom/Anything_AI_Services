import { DataTypes, Model, Sequelize } from "sequelize";

export class Apparel extends Model {
  declare id: number;
  declare userId: number;
  declare category: string;
  declare subcategory: string;
  declare brand?: string;
  declare name?: string;
  declare status: string;
  declare description?: string;
  declare material: string;
  declare colors: any;
  declare favorite: boolean;
  declare urlRaw?: string;
  declare urlProcessed?: string;
  declare gsUtilRaw?: string;
  declare gsUtilProcessed?: string;
  declare urlRawBack?: string;
  declare urlProcessedBack?: string;
  declare gsUtilRawBack?: string;
  declare gsUtilProcessedBack?: string;
  declare originalUploadedImageUrl?: string;
}

export const initApparelModel = (sequelize: Sequelize) => {
  Apparel.init(
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
      category: {
        type: DataTypes.ENUM(
          "top",
          "bottom",
          "shoe",
          "accessory",
          "outerwear",
          "dress",
        ),
        allowNull: false,
      },
      subcategory: {
        type: DataTypes.ENUM(
          "tshirt",
          "shirt",
          "jeans",
          "shorts",
          "sneakers",
          "heels",
          "jacket",
          "coat",
          "other",
        ),
        allowNull: false,
      },
      brand: { type: DataTypes.STRING },
      name: { type: DataTypes.STRING },
      status: {
        type: DataTypes.ENUM("pending", "complete", "deleted"),
        allowNull: false,
      },
      description: { type: DataTypes.STRING },
      material: {
        type: DataTypes.ENUM(
          "Cotton",
          "Linen",
          "Denim",
          "Polyester",
          "Nylon",
          "Silk",
          "Wool",
          "Rayon",
        ),
        allowNull: false,
      },
      colors: { type: DataTypes.JSON },
      favorite: { type: DataTypes.BOOLEAN, defaultValue: false },
      urlRaw: {
        type: DataTypes.TEXT,
        field: "url_raw", // Map to snake_case database column
      },
      urlProcessed: {
        type: DataTypes.TEXT,
        field: "url_processed", // Map to snake_case database column
      },
      gsUtilRaw: {
        type: DataTypes.TEXT,
        field: "gs_util_raw", // Map to snake_case database column
      },
      gsUtilProcessed: {
        type: DataTypes.TEXT,
        field: "gs_util_processed", // Map to snake_case database column
      },
      urlRawBack: {
        type: DataTypes.TEXT,
        field: "url_raw_back",
      },
      urlProcessedBack: {
        type: DataTypes.TEXT,
        field: "url_processed_back",
      },
      gsUtilRawBack: {
        type: DataTypes.TEXT,
        field: "gs_util_raw_back",
      },
      gsUtilProcessedBack: {
        type: DataTypes.TEXT,
        field: "gs_util_processed_back",
      },
      originalUploadedImageUrl: {
        type: DataTypes.TEXT,
        field: "original_uploaded_image_url",
      },
    },
    {
      sequelize,
      modelName: "Apparel",
      tableName: "apparels",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
    },
  );
};
