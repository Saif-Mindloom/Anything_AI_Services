"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.accessory_ids) {
      await queryInterface.addColumn("outfits", "accessory_ids", {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: false,
        defaultValue: [],
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE outfits o
      SET accessory_ids = s.accessory_ids,
          has_accessories = CASE
            WHEN array_length(s.accessory_ids, 1) > 0 THEN TRUE
            ELSE o.has_accessories
          END
      FROM (
        SELECT outfit_id, array_agg(id ORDER BY created_at ASC) AS accessory_ids
        FROM accessories
        GROUP BY outfit_id
      ) s
      WHERE o.id = s.outfit_id;
    `);
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.accessory_ids) {
      await queryInterface.removeColumn("outfits", "accessory_ids");
    }
  },
};
