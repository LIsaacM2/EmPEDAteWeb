# Desarrollo local

Ejecuta el backend y el frontend en dos terminales:

1. En la raíz del proyecto: `npm run dev`. El backend escucha en
   `http://localhost:3001`.
2. En la carpeta `frontend`: `npm run dev`. Abre
   `http://localhost:3000` para ver la aplicación.

El backend necesita PostgreSQL y las tablas utilizadas por la aplicación.
Para cambiar su puerto, establece la variable `PORT` antes de iniciarlo.
Si el backend utiliza otra dirección, configura `NEXT_PUBLIC_API_URL` en
`frontend/.env.local` y reinicia el frontend. Para acceder desde otros
dispositivos, usa una dirección del servidor accesible desde la red en lugar
de `localhost`.
