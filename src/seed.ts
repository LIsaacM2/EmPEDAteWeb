import { pool } from './db.js';

async function runSeed() {
  try {
    console.log('Iniciando el proceso de siembra (seeder)...');

    // 1. Limpiamos la tabla para evitar duplicados si se corre varias veces
    await pool.query('TRUNCATE TABLE challenges RESTART IDENTITY CASCADE;');
    console.log('Tabla "challenges" limpiada correctamente.');

    // 2. Definimos los retos de prueba iniciales
    const retos = [
      { category: 'Retos', content: 'Toma un trago si alguna vez has revisado el celular de tu pareja.', intensity_level: 2 },
      { category: 'Verdad', content: 'Confiesa cuál ha sido tu peor oso o pena en el trabajo.', intensity_level: 1 },
      { category: 'Reto', content: 'Imita a tu jefe o a un profesor durante 30 segundos.', intensity_level: 3 },
      { category: 'Shot', content: 'Todos los que tengan tenis blancos beben 2 tragos.', intensity_level: 2 },
      { category: 'Verdad', content: '¿Cuál es el secreto más extraño que guardas?', intensity_level: 1 }
    ];

    // 3. Insertamos cada reto en la base de datos
    for (const reto of retos) {
      const query = `
        INSERT INTO challenges (category, content, intensity_level) 
        VALUES ($1, $2, $3)
      `;
      await pool.query(query, [reto.category, reto.content, reto.intensity_level]);
    }

    console.log('¡Seeder ejecutado con éxito! Se insertaron los retos de prueba.');
  } catch (error) {
    console.error('Error al ejecutar el seeder:', error);
    process.exitCode = 1;
  } finally {
    // Cerramos la conexión para que el script termine limpiamente
    await pool.end();
  }
}

runSeed();