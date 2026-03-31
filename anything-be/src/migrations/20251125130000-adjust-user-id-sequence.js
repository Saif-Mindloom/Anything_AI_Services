"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Since PostgreSQL sequences can't start from 0, we'll use a workaround
    // We'll modify the default value to subtract 1 from the sequence value
    await queryInterface.sequelize.query(`
      ALTER TABLE users ALTER COLUMN id SET DEFAULT (nextval('users_id_seq') - 1);
    `);
  },

  async down(queryInterface, Sequelize) {
    // Restore the original sequence-based default
    await queryInterface.sequelize.query(`
      ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');
    `);
  },
};
