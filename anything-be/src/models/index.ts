import { Sequelize } from "sequelize";
import { initUserModel, User } from "./user.model";
import { initEmailOtpModel, EmailOtp } from "./emailOtp.model";
import { initApparelModel, Apparel } from "./apparel.model";
import { initOutfitModel, Outfit } from "./outfit.model";
import { initCalendarEntryModel, CalendarEntry } from "./calendarEntry.model";
import { initChatStarterModel, ChatStarter } from "./chatStarter.model";
import { initAppDocumentModel, AppDocument } from "./appDocument.model";
import { initAccessoryModel, Accessory } from "./accessory.model";
import {
  initAnythingPickModel,
  AnythingPick,
  initUsedAnythingPickModel,
  UsedAnythingPick,
} from "./anythingPick.model";

const sequelize = new Sequelize(
  process.env.DB_NAME || "anything_backend",
  process.env.DB_USER || "postgres",
  process.env.DB_PASSWORD || "postgres",
  {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    dialect: "postgres",
    dialectOptions: {
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
    logging: false,
  },
);

initUserModel(sequelize);
initEmailOtpModel(sequelize);
initApparelModel(sequelize);
initOutfitModel(sequelize);
initCalendarEntryModel(sequelize);
initChatStarterModel(sequelize);
initAppDocumentModel(sequelize);
initAccessoryModel(sequelize);
initAnythingPickModel(sequelize);
initUsedAnythingPickModel(sequelize);

// Associations
User.hasMany(EmailOtp, { foreignKey: "userId" });
EmailOtp.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Apparel, { foreignKey: "userId" });
Apparel.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Outfit, { foreignKey: "userId" });
Outfit.belongsTo(User, { foreignKey: "userId" });

User.hasMany(CalendarEntry, { foreignKey: "userId" });
CalendarEntry.belongsTo(User, { foreignKey: "userId" });

Outfit.hasMany(CalendarEntry, { foreignKey: "outfitId" });
CalendarEntry.belongsTo(Outfit, { foreignKey: "outfitId" });

Outfit.hasMany(Accessory, { foreignKey: "outfitId" });
Accessory.belongsTo(Outfit, { foreignKey: "outfitId" });

User.hasMany(AnythingPick, { foreignKey: "userId" });
AnythingPick.belongsTo(User, { foreignKey: "userId" });

Outfit.hasMany(AnythingPick, { foreignKey: "outfitId" });
AnythingPick.belongsTo(Outfit, { foreignKey: "outfitId" });

User.hasMany(UsedAnythingPick, { foreignKey: "userId" });
UsedAnythingPick.belongsTo(User, { foreignKey: "userId" });

Outfit.hasMany(UsedAnythingPick, { foreignKey: "outfitId" });
UsedAnythingPick.belongsTo(Outfit, { foreignKey: "outfitId" });

export {
  sequelize,
  User,
  EmailOtp,
  Apparel,
  Outfit,
  CalendarEntry,
  ChatStarter,
  AppDocument,
  Accessory,
  AnythingPick,
  UsedAnythingPick,
};
