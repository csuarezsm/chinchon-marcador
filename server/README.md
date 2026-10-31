# Servidor de partidas en línea · IT Canarias

Es un servidor común para las apps de juegos: hoy Chinchón, y mañana Pumba, Ajedrez y los que vengan. Corre en un contenedor Docker propio y no toca nada de lo que ya funciona en el servidor:

- **Puerto:** escucha solo en `127.0.0.1:3100`, así que no es accesible desde fuera.
- **Proxy:** el proxy del servidor le pasa el tráfico de `juegos.itcanarias.com`.
- **Recursos:** como máximo 256 MB de RAM y medio procesador.
- **Datos:** las partidas en curso se guardan en un volumen Docker propio (`itc-juegos_juegos-datos`).

## Instalación (una vez)

### 1. DNS
En el panel del dominio itcanarias.com, crea un **registro A**:
- Nombre: `juegos`
- Valor: `212.227.40.8`

Comprueba que ya apunta con `getent hosts juegos.itcanarias.com`, que debe devolver la IP.

### 2. Código
```bash
sudo mkdir -p /opt/itc-juegos && sudo chown $USER /opt/itc-juegos
git clone --depth 1 https://github.com/csuarezsm/chinchon-marcador.git /opt/itc-juegos
cd /opt/itc-juegos/server
```

### 3. Arrancar el contenedor
```bash
docker compose up -d --build
curl -s http://127.0.0.1:3100/salud
```
Debe responder `{"ok":true,...}`. Si el puerto 3100 ya estuviera ocupado, arranca con otro (`PUERTO=3110 docker compose up -d --build`) y usa ese mismo número en el proxy.

### 4. Proxy (elige el tuyo)

**nginx**
```bash
sudo cp /opt/itc-juegos/server/proxy/nginx-juegos.itcanarias.com.conf /etc/nginx/sites-available/juegos.itcanarias.com
sudo ln -s /etc/nginx/sites-available/juegos.itcanarias.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d juegos.itcanarias.com
```
- `nginx -t` comprueba la configuración antes de aplicarla: si da error, no se recarga y las demás webs siguen igual.
- `reload` no corta las conexiones de las otras webs.

**Caddy**: añade el contenido de `proxy/Caddyfile-juegos` al final de `/etc/caddy/Caddyfile` y ejecuta:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

**Traefik (Docker)**: en lugar del paso 3, ejecuta:
```bash
docker compose -f docker-compose.yml -f proxy/docker-compose.traefik.yml up -d --build
```
Antes, ajusta en ese fichero el nombre de la red y el `certresolver`.

### 5. Comprobar
```bash
curl -s https://juegos.itcanarias.com/salud
```
Con eso, el botón **En línea** de la app ya funciona.

## Día a día

| Qué | Comando (en `/opt/itc-juegos/server`) |
|---|---|
| Ver si está vivo | `curl -s http://127.0.0.1:3100/salud` |
| Ver los registros | `docker compose logs --tail 100 -f` |
| Actualizar a la última versión | `git -C /opt/itc-juegos pull && docker compose up -d --build` |
| Reiniciar | `docker compose restart` |
| Parar | `docker compose down` |
| Quitarlo del todo | `docker compose down -v`, borrar `/opt/itc-juegos` y el fichero del proxy |

Al actualizar o reiniciar, las partidas en curso se guardan y continúan: los móviles se reconectan solos.

## Cómo funciona

- **Salas:** cada partida es una sala con un código de 4 caracteres, con entre 2 y 4 jugadores. Las sillas vacías las puede ocupar la máquina.
- **El servidor manda:** reparte, guarda las cartas y comprueba cada jugada con el mismo motor que la app (`www/marcador.js` y `www/juego.js`). A cada móvil solo le envía sus cartas.
- **Reconexión:** si alguien pierde la conexión, puede volver a su silla. Si tarda más de 30 s en su turno, la máquina juega por él hasta que vuelva.
- **Límites:**
  - 40 mensajes cada 10 s por conexión.
  - 10 intentos fallidos de código por minuto.
  - Mensajes de 4 KB como máximo.
  - 2.000 salas a la vez.
- **Limpieza automática:** las salas se borran 1 h después de terminar, o tras 12 h sin nadie conectado.
- **Juego nuevo:** se añade un módulo en `src/juegos/` (con `opciones`, `iniciar`, `jugada`, `pasoAuto`, `vista`…) y se registra en `src/salas.js`.

## Protocolo (WebSocket `wss://juegos.itcanarias.com/ws`, mensajes JSON)

| La app envía | Para |
|---|---|
| `{t:'hola', token, nombre}` | identificarse (el token lo genera la app y lo guarda) |
| `{t:'crear', juego:'chinchon', opciones}` | crear una sala |
| `{t:'unirse', codigo}` | entrar con el código |
| `{t:'bot'}` / `{t:'quitar', asiento}` / `{t:'empezar'}` | acciones del anfitrión |
| `{t:'jugada', a:{tipo:'robar', de:'mazo'\|'descarte'}}` | robar |
| `{t:'jugada', a:{tipo:'tirar', carta, cerrar}}` | tirar o cerrar |
| `{t:'jugada', a:{tipo:'listo'\|'reenganche'}}` | seguir tras una mano |
| `{t:'salir'}` | dejar la partida (en juego, la máquina ocupa la silla) |

El servidor responde con `{t:'sala', sala}`, que es la vista de la sala para ese jugador, cada vez que algo cambia, y con `{t:'error', msg}` cuando algo falla.

## Pruebas
```bash
cd server && npm ci && npm test
```
En GitHub, el workflow **Servidor de juegos** pasa las pruebas, construye la imagen y la arranca para comprobarla cada vez que cambia el servidor.
