require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed (server will continue):', err.message);
  } finally {
    await pool.end();
  }
}

migrate().then(() => process.exit(0));
