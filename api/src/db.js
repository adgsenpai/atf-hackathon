import pg from 'pg';

pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (count) -> number
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> number
pg.types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD' string

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://civicwatch:civicwatch@localhost:5433/civicwatch',
  max: 10,
});

export const q = async (text, params) => (await pool.query(text, params)).rows;
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn({
      q: async (t, p) => (await client.query(t, p)).rows,
      one: async (t, p) => (await client.query(t, p)).rows[0] || null,
    });
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1 FROM categories LIMIT 1');
      return;
    } catch (e) {
      console.log(`waiting for database (${e.code || e.message})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('database not ready');
}
