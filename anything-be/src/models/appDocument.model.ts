import { DataTypes, Model, Sequelize } from "sequelize";

export interface AppDocumentAttributes {
  id: string;
  type: string;
  url: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppDocumentCreationAttributes {
  type: string;
  url: string;
  isActive?: boolean;
}

export class AppDocument
  extends Model<AppDocumentAttributes, AppDocumentCreationAttributes>
  implements AppDocumentAttributes
{
  public id!: string;
  public type!: string;
  public url!: string;
  public isActive!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export function initAppDocumentModel(sequelize: Sequelize): typeof AppDocument {
  AppDocument.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active", // Map to snake_case database column
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "created_at", // Map to snake_case database column
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "updated_at", // Map to snake_case database column
      },
    },
    {
      sequelize,
      tableName: "app_documents",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
    }
  );

  return AppDocument;
}
