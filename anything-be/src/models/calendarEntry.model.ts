import { DataTypes, Model, Sequelize } from "sequelize";

export class CalendarEntry extends Model {
  declare id: string;
  declare userId: number;
  declare outfitId?: number;
  declare date: Date;
  declare time: string;
  declare weather?: number;
  declare occasion?: string;
}

export const initCalendarEntryModel = (sequelize: Sequelize) => {
  CalendarEntry.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "user_id", // Map to snake_case database column
      },
      outfitId: {
        type: DataTypes.INTEGER,
        field: "outfit_id", // Map to snake_case database column
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      time: { type: DataTypes.TIME, allowNull: false },
      weather: { type: DataTypes.INTEGER },
      occasion: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CalendarEntry",
      tableName: "calendar_entries",
      timestamps: true,
      underscored: true, // This ensures timestamp fields are mapped to snake_case
    }
  );
};
