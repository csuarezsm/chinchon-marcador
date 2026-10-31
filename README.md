# Chinchón · Marcador

Marcador de puntos para el chinchón. App Android (Capacitor) y PWA a partir del mismo código (`www/`).
Paquete: `com.itcanarias.chinchon` · versión 2.6.0

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
- Funciona sin conexión, todo se guarda en el móvil y la pantalla no se apaga durante la partida.

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
