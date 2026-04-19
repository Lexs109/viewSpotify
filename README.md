# 🎵 Spotify Overlay

Overlay en tiempo real que muestra la canción que estás escuchando en Spotify. Perfecto para streamers y creadores de contenido.

![Node](https://img.shields.io/badge/node-16%2B-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📂 Instalación Local

### Requisitos Previos

- Node.js 24.14+ [Node.js](https://nodejs.org))
- npm
- Cuenta de Spotify
- App registrada en [Spotify Developer](https://developer.spotify.com/dashboard)

### Pasos

**1. Clonar el repositorio**

```bash
git clone https://github.com/Lexs109/viewSpotify
cd viewSpotify
```

**2. Instalar dependencias**

```bash
npm install
```

**3. Crear archivo `.env`**

Rescribe el archivo `.env.example` a `.env`: 

Edita `.env` con tus credenciales:

```env
CLIENT_ID=tu_client_id_aqui
CLIENT_SECRET=tu_client_secret_aqui
REDIRECT_URI=http://127.0.0.1:3000/callback
REFRESH_TOKEN=
PORT=3000
```

**4. Obtener credenciales de Spotify**

1. Ve a https://developer.spotify.com/dashboard
2. Inicia sesión o crea cuenta
3. Crea una nueva app
4. Copia `Client ID` y `Client Secret`
5. En Settings, agrega Redirect URI: `http://127.0.0.1:3000/callback`
6. Guarda

**5. Ejecutar localmente**

```bash
npm start
```

Abre tu navegador en `http://localhost:3000`

**6. Obtener Refresh Token**

1. Haz clic en **"Vincular Cuenta de Spotify"**
2. Autoriza la app
3. Copia el token que aparece
4. Pégalo en tu `.env` como `REFRESH_TOKEN=...`

**7. Agregar a OBS**

En OBS:
- Nueva fuente → **Browser**
- URL: `http://localhost:3000/overlay`
- Ancho: 600 | Alto: 250

---

## 🌐 Desplegar en Railway

### 1. Preparar código en GitHub

```bash
git add .
git commit -m "Código inicial"
git push origin main
```

### 2. Crear Proyecto en Railway

1. Ve a https://railway.app
2. Haz login con GitHub
3. **New Project** → **Deploy from GitHub repo**
4. Selecciona tu repositorio
5. Espera a que termine el deploy

### 3. Obtener URL de Railroad

Una vez deployado, Railroad te asigna una URL:

```
https://tu-app-production.up.railway.app
```

Copia esta URL (la necesitarás).

### 4. Configurar Spotify Developer

1. Ve a tu app en https://developer.spotify.com/dashboard
2. En **Redirect URIs**, agrega: `https://tu-app-production.up.railway.app/callback`
3. Guarda

### 5. Verificar Puerto en Network

**IMPORTANTE:** Asegúrate que Railway usa puerto 80 (HTTP):

1. En el dashboard de Railway, ve a **Settings**
2. Haz clic en **Network**
3. Verifica que aparece tu dominio con **Puerto 8080**
4. El dominio debe ser: `viewspotify-production.up.railway.app`

### 6. Agregar Variables en Railway

En el dashboard de Railway:

1. Ve a **Variables**
2. Agrega:

| Variable | Valor |
|----------|-------|
| `CLIENT_ID` | Tu Client ID |
| `CLIENT_SECRET` | Tu Client Secret |
| `REDIRECT_URI` | `https://tu-app-production.up.railway.app/callback` |
| `REFRESH_TOKEN` | `Poner aqui Refresh Token como se indica en el punto 7` |

3. Espera el redeploy automático

### 7. Obtener Refresh Token

1. Abre tu app en Railway: `https://tu-app-production.up.railway.app`
2. Haz clic en **"Vincular Cuenta de Spotify"**
3. Autoriza
4. Copia el token que aparece
5. En Railway → **Variables**, agrega: `REFRESH_TOKEN=...`

### 8. Verificar que Funciona

1. Abre `/overlay` en tu app: `https://tu-app-production.up.railway.app/overlay`
2. Reproduce una canción en Spotify
3. ¿Ves el overlay? ✅ ¡Listo!

---

## 🛠️ Estructura del Proyecto

```
spotify-overlay/
├── server.js              # Backend Express
├── public/
│   ├── index.html        # Panel de control
│   └── overlay.html      # Overlay principal
├── package.json          # Dependencias
├── .env.example          # Ejemplo de variables
└── .gitignore           # Archivos a ignorar
```

---

## 🔧 Solucionar Problemas

### Para ver fallos pueden ver los logs de railway y diagnosticar

### ❌ "redirect_uri: Not matching configuration"

**Solución:** 
- Asegúrate que tu `REDIRECT_URI` en `.env` coincida exactamente con el configurado en Spotify Developer
- En Railway: usa HTTPS
- En local: usa `http://127.0.0.1:3000/callback`

### ❌ "No se conecta a Spotify"

**Solución:**
- Verifica `CLIENT_ID` y `CLIENT_SECRET` son correctos
- Asegúrate de que Spotify está reproduciendo música
- En local: comprueba que `.env` está en la raíz del proyecto

### ❌ Rate limit de Spotify

**Solución:**
- La app maneja automáticamente los límites
- Espera unos minutos antes de intentar de nuevo

---


### Panel Principal
- URL: `/` 
- Botón para vincular Spotify
- Botón para ir al overlay

### Overlay
- URL: `/overlay`
- Muestra canción actual en tiempo real
- Colores dinámicos
- Disco giratorio

### Agregar a OBS
```
Local:    http://localhost:3000/overlay
Railway:  https://tu-app-production.up.railway.app/overlay

Tamaño recomendado: 600x250
```

---

## 📦 Dependencias

- **express** - Framework web
- **node-fetch** - Cliente HTTP
- **dotenv** - Variables de entorno
- **node-vibrant** - Extracción de colores

---

## 📝 Licencia

MIT - Libre para usar y modificar

---

## 🤝 Contribuciones

¿Ideas o mejoras? Abre un issue o pull request.