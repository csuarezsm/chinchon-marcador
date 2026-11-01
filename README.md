# Chinchón · Marcador

Marcador de puntos para el chinchón. App Android (Capacitor) y PWA a partir del mismo código (`www/`).
Paquete: `com.itcanarias.chinchon` · versión 2.9.0

**iPhone y navegadores**: la misma app se publica como versión web instalable en https://csuarezsm.github.io/chinchon-marcador/app/ (GitHub Pages, carpeta `docs/app`, copia de `www/`). En Safari: Compartir → «Añadir a pantalla de inicio». Tras cambiar `www/`, ejecuta `npm run web` antes del commit: las pruebas y el workflow comprueban que `docs/app` está al día. La página de descarga (https://csuarezsm.github.io/chinchon-marcador/) ofrece Android e iPhone, y el mensaje de «Compartir la app» enlaza a ella.

© 2026 IT Canarias. Todos los derechos reservados.

## Qué hace

- **Jugadores**: de 2 a 10, en el orden en que estáis sentados. Eliges quién da primero.
- **Reparto**: indica en cada mano quién da y quién sale, y se salta a los eliminados. Se puede cambiar a mano si alguien se equivoca.
- **Anotar mano**: los puntos de cada jugador y quién cerró, con tres opciones:
  - *Normal*: suma sus puntos.
  - *Todo ligado*: −10 (configurable).
  - *Chinchón*: gana la partida, o resta puntos si así lo configuras.
- **Totales**: totales con barra de progreso y lo que le queda a cada uno hasta el límite.
- **Eliminación**: queda eliminado quien pasa del límite (100 por defecto).
- **Reenganche**: el eliminado vuelve con los puntos del que más tiene, o con una cifra fija. Se fija un número máximo de reenganches por jugador (0 = sin límite).
- **Bote** (opcional): importe de entrada y de cada reenganche.
- **Historial**: tabla mano a mano. Si tocas una mano, la puedes corregir o borrar y todo se recalcula. También se puede deshacer el último movimiento.
- **Final**: ganador, revancha con los mismos jugadores (da el siguiente) e historial de partidas.
- **Contra la máquina**: de 1 a 3 rivales con tres niveles, comodines opcionales y modo aprendizaje (`www/juego.js`).
- **En línea**: partidas de 2 a 4 jugadores con código de sala y la máquina en las sillas libres (`www/online.js`). Usa el servidor común de juegos de IT Canarias, [csuarezsm/juegos-servidor](https://github.com/csuarezsm/juegos-servidor) (`wss://juegos.itcanarias.com/ws`), que carga las reglas de `www/marcador.js` y `www/juego.js`. Si cambian las reglas, hay que copiar esos dos archivos a `motores/chinchon/` del servidor y reinstalarlo.
- Funciona sin conexión (salvo el juego en línea), todo se guarda en el móvil y la pantalla no se apaga durante la partida.

## Compilar el APK

### Opción A: Android Studio
```bash
npm install
npx cap sync android
npx cap open android      # Build > Build APK(s)
```

### Opción B: GitHub Actions (sin instalar nada)
Sube el proyecto a un repo de GitHub. El workflow `.github/workflows/android.yml` compila un APK de depuración en cada push a `main`. Lo descargas desde *Actions → última ejecución → Artifacts → chinchon-apk*.

### Opción C: línea de comandos
```bash
npm install && npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Para publicarla en Google Play hace falta firmarla: en Android Studio, *Build > Generate Signed Bundle / APK*.

## Usarla como PWA
Sirve la carpeta `www/` por HTTPS (en cualquier subdominio del VPS, como estático) y en Chrome Android elige *Añadir a pantalla de inicio*.

## Modificar
Toda la app está en `www/index.html`. Después de cambiarla:
- `npx cap sync android` para la app nativa.
- Sube el número de `CACHE` en `www/sw.js` para que la PWA se actualice.
- Iconos: `npm run icons` (lee de `assets/`).

## Más juegos de IT Canarias

En el menú ⋮ → «🎲 Más juegos de IT Canarias» y en la página de descarga aparecen los otros juegos (Ajedrez, Damas, Chinchón, Pumba). El código es `www/masjuegos.js`, **el mismo archivo en todas las apps**, con la lista y los iconos (`www/juegos/`) dentro para que funcione sin conexión. Con internet, la app lee como mucho cada 12 horas el catálogo común `https://csuarezsm.github.io/juegos-servidor/juegos.json` (repo `juegos-servidor`, carpeta `docs/`): un juego nuevo añadido allí aparece en todas las apps sin actualizarlas. En Android, si el otro juego está instalado, el botón lo abre (plugin `OtrasApps` y `<queries>` del manifiesto); si no, lleva a su página de descarga, o a Google Play si el catálogo tiene su enlace `play` y esta es la versión de Play. En iPhone abre su versión web.

## Aviso de turno en línea

En una partida en línea, cuando pasa a ser tu turno suena un «ding-dong» corto y el móvil vibra (`www/turno.js`, el mismo archivo en todas las apps; sonido sintetizado). Se quita en ⋮ → Colores… → «🔔 Aviso de turno en línea». Suena con la app abierta; con la app en segundo plano el sistema puede pausarla.

## Idiomas (español e inglés)

⋮ → «🌐 Idioma · Language». La primera vez se usa el idioma del móvil (español si empieza por «es»; si no, inglés). La app está escrita en español y `www/idioma.js` traduce lo que se ve con el diccionario `www/i18n-en.js` (los dos, **los mismos archivos en todas las apps**): textos, plantillas con datos ({1}, {2}…), mensajes para compartir, imágenes, fechas y números. Cuando se añade o cambia un texto en español, hay que añadir su traducción al diccionario común (`comun/` en el chat de desarrollo) y copiarlo a todas las apps. Para otro idioma: un `i18n-<código>.js` y su nombre en `IDIOMAS` de `idioma.js`.
