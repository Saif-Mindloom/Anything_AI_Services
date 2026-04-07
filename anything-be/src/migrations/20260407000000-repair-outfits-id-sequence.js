"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    let outfitsColumns;
    try {
      outfitsColumns = await queryInterface.describeTable("outfits");
    } catch (error) {
      // Table does not exist in this environment yet.
      return;
    }

    if (!outfitsColumns.id) {
      return;
    }

    // Ensure sequence exists and is linked as default for outfits.id.
    await queryInterface.sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS outfits_id_seq;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "outfits"
      ALTER COLUMN "id" SET DEFAULT nextval('outfits_id_seq');
    `);

    await queryInterface.sequelize.query(`
      ALTER SEQUENCE outfits_id_seq OWNED BY "outfits"."id";
    `);

    await queryInterface.sequelize.query(`
      SELECT setval(
        'outfits_id_seq',
        COALESCE((SELECT MAX(id) FROM "outfits"), 0) + 1,
        false
      );
    `);
  },

  async down(queryInterface) {
    // Keep rollback safe and non-destructive: only remove default binding.
    try {
      const outfitsColumns = await queryInterface.describeTable("outfits");
      if (outfitsColumns.id) {
        await queryInterface.sequelize.query(`
          ALTER TABLE "outfits"
          ALTER COLUMN "id" DROP DEFAULT;
        `);
      }
    } catch (error) {
      // no-op
    }
  },
};
