require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

async function migrate() {
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('Starting migration...');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  try {
    console.log('Executing schema...');
    await pool.query(sql);
    console.log('=== MIGRATION COMPLETE ===');
  } catch (err) {
    console.error('MIGRATION ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

migrate().then(() => process.exit(0));
