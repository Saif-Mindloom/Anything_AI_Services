import { DataTypes, Model, Sequelize } from "sequelize";

export class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;
  declare password?: string;
  declare dob?: string;
  declare height: number;
  declare weight: number;
  declare gender?: "male" | "female" | "other";
  declare faceImages: any;
  declare bodyImages: any;
  declare baseModelUrl: string;
  declare gsUtil?: string;
  declare profileCompleted: boolean;
  declare deletionScheduledAt?: Date | null;
}

export const initUserModel = (sequelize: Sequelize) => {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      password: { type: DataTypes.STRING, allowNull: true },
      dob: { type: DataTypes.STRING, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: false },
      weight: { type: DataTypes.INTEGER, allowNull: false },
      gender: {
        type: DataTypes.ENUM("male", "female", "other"),
        allowNull: true,
      },
      faceImages: {
        type: DataTypes.JSON,
        field: "face_images", // Map to snake_case database column
      },
      bodyImages: {
        type: DataTypes.JSON,
        field: "body_images", // Map to snake_case database column
      },
      baseModelUrl: {
        type: DataTypes.TEXT,
        field: "base_model_url", // Map to snake_case database column
      },
      gsUtil: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "gs_util", // Map to snake_case database column
      },
      profileCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "profile_completed",
      },
      deletionScheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: "deletion_scheduled_at",
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
      hooks: {
        beforeCreate: (user: User) => {
          if (user.email) {
            user.email = user.email.toLowerCase();
          }
        },
        beforeUpdate: (user: User) => {
          if (user.email) {
            user.email = user.email.toLowerCase();
          }
        },
      },
    }
  );
};
