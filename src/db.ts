import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

// pg lee PGHOST, PGPORT, PGUSER y PGPASSWORD del entorno.
export const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'empedate_game_db',
});