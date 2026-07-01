# Generar el APK de Lubrimesys (Capacitor)

El APK es una **WebView** que carga la app publicada en GitHub Pages
(`https://josegalvez1985.github.io/lubrimec-sys-erp/`). No empaqueta la web adentro: siempre
muestra la última versión publicada. Config en `capacitor.config.ts` (`server.url`).

> Como el contenido vive en Pages, **NO** hace falta regenerar el APK cuando cambia la app web.
> Solo se regenera si cambian `capacitor.config.ts`, el ícono, el nombre o la versión.

## Requisitos

- **Node 18+** (para `npx cap`).
- **JDK 21** en `C:\Program Files\Java\jdk-21.0.10` (Capacitor 8 / AGP 8 no compila con Java 17).
- **Android SDK** en `C:\Program Files\Android\cmdline-tools` (platform android-36, build-tools 36.1.0).
  La ruta del SDK está fijada en `android/local.properties` (`sdk.dir=...`). Si el SDK está en otro
  lado, editar ese archivo. `local.properties` NO se commitea (es local de cada máquina).

## Build (PowerShell, desde la raíz del proyecto)

```powershell
# 1. Java 21 solo para esta sesión (no toca el JAVA_HOME global)
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.10"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version   # debe decir 21

# 2. Sincronizar la config de Capacitor con el proyecto Android
npx cap sync android

# 3. Compilar
cd android
.\gradlew --stop
.\gradlew clean

# --- OPCIÓN A: DEBUG (para probar YA; instalable directo, firmado con debug key) ---
.\gradlew assembleDebug --stacktrace
# salida: android\app\build\outputs\apk\debug\app-debug.apk

# --- OPCIÓN B: RELEASE (para distribuir; sale SIN firmar, ver "Firmar") ---
# .\gradlew assembleRelease --stacktrace
# salida: android\app\build\outputs\apk\release\app-release-unsigned.apk

# 4. Publicar: copiar el APK a public/ (lo sirve GitHub Pages para la descarga).
# -Force SOBRESCRIBE el public\lubrimesys.apk anterior: el nombre es fijo, siempre se
# reemplaza el APK viejo por el nuevo (no se acumulan versiones en el repo).
cd ..
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk public\lubrimesys.apk -Force
```

Abrir la carpeta del resultado:

```powershell
explorer .\app\build\outputs\apk\debug\
```

## Instalar en el celular (prueba)

1. Copiar `app-debug.apk` al teléfono (o descargarlo del Release, ver abajo).
2. Habilitar "Instalar apps de fuentes desconocidas" para el navegador/gestor de archivos.
3. Abrir el APK e instalar.

El APK debug ya viene firmado con la debug key, así que se instala sin pasos extra.

## Publicar el APK (para el botón "Descargar app" del login)

El APK se sirve **desde GitHub Pages**, igual que la web (no se usa GitHub Releases). El botón
"Descargar app" del login apunta a `public/lubrimesys.apk`, que Pages publica en:
`https://josegalvez1985.github.io/lubrimec-sys-erp/lubrimesys.apk`

Cada vez que generes un APK nuevo:

1. Copiar el APK compilado a **`public/lubrimesys.apk`** (sobrescribe el anterior):
   ```powershell
   Copy-Item android\app\build\outputs\apk\debug\app-debug.apk public\lubrimesys.apk -Force
   ```
2. Subir `versionName` (y `versionCode`) en `android/app/build.gradle` y poner la **misma versión**
   en `public/apk-version.json` (para el banner de aviso de actualización).
3. `git add public/lubrimesys.apk public/apk-version.json android/app/build.gradle` → commit → push.
   El workflow de Pages lo publica y el botón "Descargar app" sirve el APK nuevo.

> El APK está excluido del `.gitignore` general (`*.apk`) con la excepción `!public/lubrimesys.apk`,
> así que **este sí se commitea** (los demás `.apk` de `android/build/` siguen ignorados).

## ¿Cuándo hay que regenerar el APK?

El APK es una **WebView remota**: carga la app desde Pages. Por eso el contenido web es dinámico.

- **NO regenerar** (basta `git push` → Pages): páginas nuevas, lógica, estilos, endpoints, bugfixes.
  El usuario ve los cambios al reabrir/refrescar la app.
- **SÍ regenerar** el APK: cambia el ícono, el nombre (`appName`), el `appId`, la `server.url`, se
  agrega/actualiza un plugin nativo de Capacitor, o se publica una versión nueva (subir
  `versionName`/`versionCode`).

## Avisar al usuario de una versión nueva del APK

Como Android no autoactualiza APKs fuera de Play Store, el usuario debe descargar e instalar el
nuevo APK. El front lo **avisa con un banner** (`src/components/apk-update-banner.tsx` +
`src/hooks/use-apk-update.ts`): dentro del APK, compara su `versionName` (leído con
`@capacitor/app`) contra **`public/apk-version.json`**. Si el JSON tiene una versión mayor, muestra
"Nueva versión disponible" con botón que abre el APK nuevo.

**Flujo para publicar una actualización del APK:**
1. Subir `versionName` (y `versionCode`) en `android/app/build.gradle` (ej. `1.1.0`).
2. Regenerar el APK, renombrarlo a `lubrimesys.apk` y subirlo al Release (`latest`).
3. Editar `public/apk-version.json` con la **misma versión** (`"version": "1.1.0"`) y `git push`
   (Pages lo publica). Los APK instalados detectan el cambio y muestran el banner.

> Importante: la versión de `apk-version.json` debe coincidir con el `versionName` del APK subido.
> El banner solo aparece **dentro del APK** (en navegador no molesta).

## Ícono de la app

El ícono es el logo de Lubrimec. Se genera desde `assets/icon.png` (1024×1024, logo centrado sobre
blanco, creado a partir de `public/logo.png`) con:

```powershell
npx @capacitor/assets generate --android --iconBackgroundColor "#ffffff" --iconBackgroundColorDark "#1a120b"
```

Eso crea los `mipmap-*` y el adaptive icon en `android/app/src/main/res/`. Tras cambiarlo, regenerar
el APK. Para cambiar el logo: reemplazar `assets/icon.png` y volver a correr el comando.

## Firmar el APK release (etapa posterior, para distribución final)

El `assembleRelease` sale sin firmar. Para firmarlo:

```powershell
# Crear un keystore propio (guardar la contraseña en lugar seguro; NO commitear el .jks)
keytool -genkey -v -keystore lubrimec-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias lubrimec

# Firmar y alinear
& "C:\Program Files\Android\cmdline-tools\build-tools\36.1.0\apksigner.bat" sign `
  --ks lubrimec-release.jks `
  --out lubrimesys.apk `
  app\build\outputs\apk\release\app-release-unsigned.apk

# Verificar
& "C:\Program Files\Android\cmdline-tools\build-tools\36.1.0\apksigner.bat" verify lubrimesys.apk
```

Para automatizar la firma en cada release, agregar un `signingConfig` en
`android/app/build.gradle` que lea el keystore desde variables de entorno.

## Notas

- `capacitor.config.ts` → `server.url` es la URL de Pages. Si el front migra a otro host, cambiar
  esa URL y regenerar el APK.
- `appId` = `com.lubrimec.sys`, `appName` = "Lubrimesys".
- Antes de un release de distribución, subir `versionCode` / `versionName` en
  `android/app/build.gradle`.
- En PowerShell invocar siempre `.\gradlew` (con `.\`).
- La carpeta `android/` se commitea; sus artefactos de build los ignora `android/.gitignore`.
