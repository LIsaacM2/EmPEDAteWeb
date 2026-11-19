# EmPEDAte

Juego de fiesta multijugador con Next.js, Express, Socket.IO y PostgreSQL.
El servidor mantiene el estado de cada sala, el anfitrión, los retos, las
reglas, el temporizador y la puntuación.

## Requisitos

- Node.js 24 y npm (Next.js requiere al menos Node.js 20.9).
- PostgreSQL y sus herramientas `psql` y `createdb`.
- Git y dos terminales.

Los comandos siguientes usan PowerShell desde la raíz del proyecto. En macOS
o Linux, sustituye las rutas con `\` por rutas con `/` y usa `cp` en lugar de
`Copy-Item`.

## Instalación en otro equipo

1. Clona el repositorio y entra en su carpeta:

   ```powershell
   git clone https://github.com/LIsaacM2/EmPEDAteWeb.git
   cd EmPEDAteWeb
   ```

2. Instala las dependencias de ambos proyectos:

   ```powershell
   npm ci
   npm --prefix frontend ci
   ```

3. Crea la configuración local y edita `.env` con tus datos de PostgreSQL:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` configuran la
   conexión. `PORT` cambia el puerto del backend, que por defecto es 3001.
   El archivo `.env` está ignorado por Git: no compartas ni subas contraseñas.
   Si usaste la contraseña que antes estaba en el código, cámbiala porque
   podría permanecer en el historial de Git.

4. Crea una base de datos **nueva** con el nombre configurado en `PGDATABASE`
   y ejecuta el esquema. Por ejemplo, con los valores predeterminados:

   ```powershell
   createdb -U postgres empedate_game_db
   psql -U postgres -d empedate_game_db -v ON_ERROR_STOP=1 -f .\src\schema.sql
   ```

   `schema.sql` está pensado para una base vacía, no es una migración para
   bases existentes. El usuario configurado en `.env` debe tener permisos para
   acceder a las tablas.

5. Opcionalmente, carga el catálogo de ejemplo:

   ```powershell
   npx tsx .\src\seed.ts
   ```

   **Atención:** este comando vacía `challenges` con `TRUNCATE ... CASCADE`;
   úsalo solo si puedes borrar los retos existentes y sus datos relacionados.
   Es necesario tener al menos un reto para jugar.

6. Inicia los dos servidores, cada uno en su propia terminal:

   ```powershell
   # Terminal 1: backend
   npm run dev
   ```

   ```powershell
   # Terminal 2: frontend
   npm --prefix frontend run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000). El backend y Socket.IO
   escuchan en `http://localhost:3001`. Si un puerto está ocupado, detén el
   proceso anterior o ajusta los puertos.

## Acceso desde otros dispositivos

El navegador usa `http://localhost:3001` como backend por defecto. En otro
dispositivo, `localhost` apunta a ese dispositivo, no al equipo servidor.
Crea `frontend/.env.local` con una dirección accesible desde la red:

```dotenv
NEXT_PUBLIC_API_URL=http://IP_DEL_SERVIDOR:3001
```

Reinicia el frontend después de cambiarla. Abre en los demás dispositivos
`http://IP_DEL_SERVIDOR:3000` y permite los puertos 3000 y 3001 en el firewall.
Si cambias `PORT`, actualiza también `NEXT_PUBLIC_API_URL`. La configuración
por defecto permite conexiones de cualquier origen y usa HTTP: está pensada
para una red de confianza, no para exponerla directamente a Internet.

## Uso y reglas

- Escribe un apodo para crear una sala o unirte con su código; no hay login.
  La credencial temporal del invitado se guarda en el navegador.
- El creador es el anfitrión. Puede transferir el rol desde la lista; si sale o
  se desconecta, lo recibe el siguiente jugador conectado por orden de entrada.
- El anfitrión inicia los temporizadores. Al marcar un reto cumplido, el
  jugador asignado gana un punto y se muestra otro reto; al omitirlo no gana
  puntos.
- Una ronda de una regla equivale al número de participantes conectados al
  avanzar cada pregunta. La pregunta que activó la regla no cuenta.
- Al finalizar se muestra el podio y la sala permanece abierta. El anfitrión
  puede iniciar una nueva partida con puntos y reglas reiniciados.

El catálogo y las membresías se almacenan en PostgreSQL, pero el estado de la
partida, puntos, anfitrión en vivo y credenciales de invitado están en memoria.
Se pierden al reiniciar el backend; no está diseñado aún para múltiples
instancias ni para producción sin controles adicionales de seguridad.

### Añadir retos

En la tabla `challenges`, usa `duration_type = 'normal'` para retos sin
temporizador, `'seconds'` para una cuenta regresiva o `'rounds'` para reglas
persistentes. En los dos últimos casos, `duration_value` debe ser un entero
positivo con el número de segundos o rondas.

## Comprobaciones

```powershell
npm test
npx tsc --noEmit
npm --prefix frontend run lint
npm --prefix frontend run build
```

Las pruebas de juego usan una base de datos simulada; no modifican tu catálogo.
El mensaje de error de base de datos simulado durante la prueba es intencional.

## Estructura

- `src/index.ts`: servidor HTTP, eventos Socket.IO y temporizador.
- `src/gameController.ts`: creación de salas e incorporación de invitados.
- `src/gameState.ts` y `src/guestSessions.ts`: reglas y sesiones temporales.
- `src/schema.sql` y `src/seed.ts`: esquema inicial y catálogo de ejemplo.
- `frontend/app`: interfaz de juego y podio.
- `tests`: pruebas de integración.
