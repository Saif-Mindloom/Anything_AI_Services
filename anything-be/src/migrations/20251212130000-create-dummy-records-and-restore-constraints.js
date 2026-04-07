"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");

    // Create dummy user with ID 0
    await queryInterface.sequelize.query(
      `INSERT INTO users (id, name, email, dob, height, weight, created_at, updated_at)
       VALUES (0, 'System Dummy User', 'dummy@system.internal', '2000-01-01', 170, 70, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    // Create dummy apparels with ID 0 for each category (need to provide all required fields)
    await queryInterface.sequelize.query(
      `INSERT INTO apparels (id, user_id, category, subcategory, status, material, name, created_at, updated_at)
       VALUES (0, 0, 'top', 'other', 'complete', 'Cotton', 'NO_TOP', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    await queryInterface.sequelize.query(
      `INSERT INTO apparels (id, user_id, category, subcategory, status, material, name, created_at, updated_at)
       VALUES (-1, 0, 'bottom', 'other', 'complete', 'Cotton', 'NO_BOTTOM', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    await queryInterface.sequelize.query(
      `INSERT INTO apparels (id, user_id, category, subcategory, status, material, name, created_at, updated_at)
       VALUES (-2, 0, 'shoe', 'other', 'complete', 'Cotton', 'NO_SHOE', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    await queryInterface.sequelize.query(
      `INSERT INTO apparels (id, user_id, category, subcategory, status, material, name, created_at, updated_at)
       VALUES (-3, 0, 'accessory', 'other', 'complete', 'Cotton', 'NO_DRESS', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    // Restore foreign key constraints on outfits table
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'outfits_top_id_fkey'
        ) THEN
          ALTER TABLE "outfits"
          ADD CONSTRAINT "outfits_top_id_fkey"
          FOREIGN KEY ("top_id") REFERENCES "apparels" ("id") ON DELETE SET DEFAULT;
        END IF;
      END
      $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'outfits_bottom_id_fkey'
        ) THEN
          ALTER TABLE "outfits"
          ADD CONSTRAINT "outfits_bottom_id_fkey"
          FOREIGN KEY ("bottom_id") REFERENCES "apparels" ("id") ON DELETE SET DEFAULT;
        END IF;
      END
      $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'outfits_shoe_id_fkey'
        ) THEN
          ALTER TABLE "outfits"
          ADD CONSTRAINT "outfits_shoe_id_fkey"
          FOREIGN KEY ("shoe_id") REFERENCES "apparels" ("id") ON DELETE SET DEFAULT;
        END IF;
      END
      $$;
    `);

    if (columns.dress_id) {
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'outfits_dress_id_fkey'
          ) THEN
            ALTER TABLE "outfits"
            ADD CONSTRAINT "outfits_dress_id_fkey"
            FOREIGN KEY ("dress_id") REFERENCES "apparels" ("id") ON DELETE SET DEFAULT;
          END IF;
        END
        $$;
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove foreign key constraints
    await queryInterface.removeConstraint("outfits", "outfits_top_id_fkey");
    await queryInterface.removeConstraint("outfits", "outfits_bottom_id_fkey");
    await queryInterface.removeConstraint("outfits", "outfits_shoe_id_fkey");
    await queryInterface.removeConstraint("outfits", "outfits_dress_id_fkey");

    // Delete dummy records
    await queryInterface.sequelize.query(
      `DELETE FROM apparels WHERE id IN (0, -1, -2, -3)`
    );

    await queryInterface.sequelize.query(`DELETE FROM users WHERE id = 0`);
  },
};
