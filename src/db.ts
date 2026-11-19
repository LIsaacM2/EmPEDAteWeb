import pkg from 'pg';
const { Pool } = pkg;

// Configuración centralizada de la base de datos
export const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'empedate_game_db',
  password: 'PokeTaco21.', // Cambia esto por tu contraseña real
  port: 5432,
});