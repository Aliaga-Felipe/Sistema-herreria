import pg from 'pg';

// SSL sólo si la base es un servicio externo que lo exige (DATABASE_SSL=true).
// Con PostgreSQL en el mismo servidor (el VPS) va sin SSL, aunque NODE_ENV
// sea "production".
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
});
