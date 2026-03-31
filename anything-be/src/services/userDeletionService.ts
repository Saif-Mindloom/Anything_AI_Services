import { Op } from "sequelize";
import {
  User,
  Apparel,
  Outfit,
  Accessory,
  CalendarEntry,
  AnythingPick,
  UsedAnythingPick,
  EmailOtp,
  sequelize,
} from "../models/index";
import { deleteUserFolder } from "./gcsService";

const DELETION_DELAY_DAYS = 30;

// ─────────────────────────────────────────────
// Schedule deletion (soft-flag, 30-day grace)
// ─────────────────────────────────────────────

export const scheduleUserDeletion = async (
  userId: number
): Promise<{ success: boolean; scheduledFor: Date | null; message: string }> => {
  const user = await User.findByPk(userId);
  if (!user) {
    return { success: false, scheduledFor: null, message: "User not found" };
  }

  if (user.deletionScheduledAt) {
    return {
      success: false,
      scheduledFor: user.deletionScheduledAt,
      message: "Account deletion is already scheduled",
    };
  }

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + DELETION_DELAY_DAYS);

  await user.update({ deletionScheduledAt: scheduledFor });

  console.log(
    `[UserDeletion] Scheduled deletion for user ${userId} at ${scheduledFor.toISOString()}`
  );

  return {
    success: true,
    scheduledFor,
    message: `Account scheduled for deletion on ${scheduledFor.toDateString()}. You can cancel this within ${DELETION_DELAY_DAYS} days.`,
  };
};

// ─────────────────────────────────────────────
// Cancel a scheduled deletion
// ─────────────────────────────────────────────

export const cancelScheduledDeletion = async (
  userId: number
): Promise<{ success: boolean; message: string }> => {
  const user = await User.findByPk(userId);
  if (!user) {
    return { success: false, message: "User not found" };
  }

  if (!user.deletionScheduledAt) {
    return {
      success: false,
      message: "No deletion is currently scheduled for this account",
    };
  }

  await user.update({ deletionScheduledAt: null });

  console.log(`[UserDeletion] Cancelled scheduled deletion for user ${userId}`);

  return { success: true, message: "Account deletion has been cancelled" };
};

// ─────────────────────────────────────────────
// Immediate hard delete
// ─────────────────────────────────────────────

export const deleteUserImmediately = async (
  userId: number
): Promise<{ success: boolean; message: string }> => {
  const user = await User.findByPk(userId);
  if (!user) {
    return { success: false, message: "User not found" };
  }

  console.log(`[UserDeletion] Starting immediate deletion for user ${userId}`);

  // ── 1. Delete all GCS assets for the user ──────────────────────────────
  try {
    await deleteUserFolder(userId);
    console.log(`[UserDeletion] GCS assets deleted for user ${userId}`);
  } catch (gcsErr) {
    // Log but don't abort — we still want to purge the DB rows
    console.error(
      `[UserDeletion] GCS deletion partially failed for user ${userId}:`,
      gcsErr instanceof Error ? gcsErr.message : gcsErr
    );
  }

  // ── 2. Delete DB records in dependency order inside a transaction ───────
  await sequelize.transaction(async (t) => {
    // Accessories cascade from outfits, but delete explicitly for clarity
    const userOutfits = await Outfit.findAll({
      where: { userId },
      attributes: ["id"],
      transaction: t,
    });
    const outfitIds = userOutfits.map((o) => o.id);

    if (outfitIds.length > 0) {
      await Accessory.destroy({ where: { outfitId: { [Op.in]: outfitIds } }, transaction: t });
    }

    await CalendarEntry.destroy({ where: { userId }, transaction: t });
    await AnythingPick.destroy({ where: { userId }, transaction: t });
    await UsedAnythingPick.destroy({ where: { userId }, transaction: t });
    await Apparel.destroy({ where: { userId }, transaction: t });
    await Outfit.destroy({ where: { userId }, transaction: t });
    await EmailOtp.destroy({ where: { userId }, transaction: t });
    await user.destroy({ transaction: t });
  });

  console.log(`[UserDeletion] User ${userId} fully deleted from DB`);

  return { success: true, message: "User account and all associated data have been permanently deleted" };
};

// ─────────────────────────────────────────────
// Process all users whose grace period expired
// Called by the scheduled job worker
// ─────────────────────────────────────────────

export const processDueForDeletion = async (): Promise<number> => {
  const now = new Date();

  const dueUsers = await User.findAll({
    where: {
      deletionScheduledAt: { [Op.lte]: now },
    },
    attributes: ["id"],
  });

  if (dueUsers.length === 0) {
    console.log("[UserDeletion] No users due for deletion");
    return 0;
  }

  console.log(`[UserDeletion] Processing ${dueUsers.length} user(s) due for deletion`);

  let deleted = 0;
  for (const user of dueUsers) {
    try {
      const result = await deleteUserImmediately(user.id);
      if (result.success) deleted++;
    } catch (err) {
      console.error(
        `[UserDeletion] Failed to delete user ${user.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(`[UserDeletion] Successfully deleted ${deleted}/${dueUsers.length} users`);
  return deleted;
};
