import { DataTypes, Model, Sequelize } from "sequelize";

export class EmailOtp extends Model {
  declare id: string;
  declare userId: number | null;
  declare email: string;
  declare otp: string;
  declare expiresAt: Date;
}

export const initEmailOtpModel = (sequelize: Sequelize) => {
  EmailOtp.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "user_id", // Map to snake_case database column
      },
      email: { type: DataTypes.STRING, allowNull: false },
      otp: { type: DataTypes.STRING, allowNull: false },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "expires_at", // Map to snake_case database column
      },
    },
    {
      sequelize,
      modelName: "EmailOtp",
      tableName: "email_otps",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
      hooks: {
        beforeCreate: (emailOtp: EmailOtp) => {
          if (emailOtp.email) {
            emailOtp.email = emailOtp.email.toLowerCase();
          }
        },
        beforeUpdate: (emailOtp: EmailOtp) => {
          if (emailOtp.email) {
            emailOtp.email = emailOtp.email.toLowerCase();
          }
        },
      },
    }
  );
};
