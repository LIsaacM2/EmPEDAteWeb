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

## Reglas de la partida

El anfitrión inicia los temporizadores y decide si un reto se completa o se
omite. Completarlo suma un punto al jugador asignado y muestra otro reto;
omitirlo no suma puntos. Las reglas por rondas cuentan los retos posteriores:
una ronda equivale al número de participantes conectados cuando se avanza
cada reto. La partida finaliza con el podio, pero la sala permanece abierta;
el anfitrión puede iniciar otra partida con los puntos y reglas reiniciados.

El estado y los puntos viven en la memoria del servidor y se pierden al
reiniciarlo. No hace falta crear una cuenta: cada invitado usa un nombre y una
credencial temporal guardada en su navegador para volver a la sala. El mismo
nombre no puede usarse simultáneamente por dos invitados de la misma sala.
El anfitrión puede designar a otro jugador conectado desde la lista; si sale o
se desconecta, el rol pasa al siguiente jugador conectado por orden de entrada.

Si aparece el error de que se requiere el `userId` del anfitrión, detén el
backend anterior y vuelve a iniciarlo desde la raíz con `npm run dev`.
