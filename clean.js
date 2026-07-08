import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres@localhost:5433/warden',
});

async function clean() {
  await pool.query('DELETE FROM task_history');
  await pool.query('DELETE FROM tasks');
  console.log('All operations deleted successfully.');
  process.exit(0);
}

clean().catch(console.error);
