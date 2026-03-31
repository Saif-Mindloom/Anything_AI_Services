import { DataTypes, Model, Sequelize } from "sequelize";

export interface ChatStarterAttributes {
  id: string;
  message: string;
  category?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatStarterCreationAttributes {
  message: string;
  category?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export class ChatStarter
  extends Model<ChatStarterAttributes, ChatStarterCreationAttributes>
  implements ChatStarterAttributes
{
  public id!: string;
  public message!: string;
  public category!: string | null;
  public sortOrder!: number;
  public isActive!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export function initChatStarterModel(sequelize: Sequelize): typeof ChatStarter {
  ChatStarter.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "sort_order", // Map to snake_case database column
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
      tableName: "chat_starters",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
    }
  );

  return ChatStarter;
}
