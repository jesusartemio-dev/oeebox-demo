const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(client => {
    console.log('Database connected');
    client.release();
  })
  .catch(err => {
    console.error('Database connection error:', err.message);
  });

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
