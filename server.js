import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import Vibrant from "node-vibrant/lib/index.js";

if (!process.env.RAILWAY_ENVIRONMENT) {
    dotenv.config();
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Prioridad 1: Variable de entorno (Railway)
let refresh_token = process.env.REFRESH_TOKEN || "";

// Prioridad 2: Archivo local (Solo si no hay variable de entorno y el archivo existe)
if (!refresh_token && fs.existsSync(".refresh_token")) {
    try {
        refresh_token = fs.readFileSync(".refresh_token", "utf-8").trim();
        console.log("Token cargado desde archivo local");
    } catch (err) {
        console.error("Error leyendo .refresh_token:", err.message);
    }
}

let cachedAccessToken = null;
let tokenExpiresAt = 0;

if (!refresh_token && fs.existsSync(".refresh_token")) {
    refresh_token = fs.readFileSync(".refresh_token", "utf-8").trim();
    console.log("Token cargado desde archivo local");
}

// ── Caché de canción ──────────────────────────────────────
let songCache = null;
let lastSongFetch = 0;
let rateLimitedUntil = 0;  //variable separada para el ban temporal
const SONG_TTL = 3000;   // consulta Spotify cada 15s máximo

app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/public/index.html");
});

app.get("/overlay/:id", (req, res) => {
    const id = req.params.id;
    const file = process.cwd() + `/public/overlay${id}.html`;
    if (fs.existsSync(file)) {
        res.sendFile(file);
    } else {
        res.status(404).send("Overlay no encontrado");
    }
});

app.get("/overlays", (req, res) => {
    res.sendFile(process.cwd() + "/public/overlays.html");
});

app.get("/login", (req, res) => {
    // Detectamos la URL actual (local o nube)
    const host = req.get('host');
    const protocol = process.env.RAILWAY_ENVIRONMENT ? 'https' : req.protocol;
    const dynamicRedirect = `${protocol}://${host}/callback`;

    const scope = "user-read-currently-playing user-modify-playback-state";
    const authURL = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope,
        redirect_uri: dynamicRedirect, // Usamos la dinámica en lugar de la del .env
    });
    res.redirect(authURL);
});

app.get("/callback", async (req, res) => {
    const code = req.query.code;
    const host = req.get('host');
    const protocol = process.env.RAILWAY_ENVIRONMENT ? 'https' : req.protocol;
    const dynamicRedirect = `${protocol}://${host}/callback`;
    const baseUrl = `${protocol}://${host}`;

    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: dynamicRedirect, //Usamos la misma dinámica aquí
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error_description);

        refresh_token = data.refresh_token;

        // Si NO estamos en Railway, guardamos el token en un archivo para que no se pierda al reiniciar
        if (!process.env.RAILWAY_ENVIRONMENT) {
            fs.writeFileSync(".refresh_token", refresh_token);
        }

        console.log("\n" + "=".repeat(40));
        console.log("NUEVO REFRESH_TOKEN OBTENIDO:");
        console.log(refresh_token);
        console.log("=".repeat(40) + "\n");

        cachedAccessToken = data.access_token;
        tokenExpiresAt = Date.now() + data.expires_in * 1000;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: sans-serif; background: #121212; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: #181818; padding: 40px; border-radius: 20px; text-align: center; border: 1px solid #282828; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 500px; width: 90%; }
                    h1 { color: #1DB954; margin-bottom: 5px; }
                    .token-box { background: #000; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px dashed #333; position: relative; }
                    .token-text { color: #1DB954; font-family: monospace; font-size: 12px; word-break: break-all; display: block; margin-bottom: 10px; }
                    .btn-group { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
                    .btn { display: inline-block; background: #1DB954; color: black; text-decoration: none; padding: 12px 25px; border-radius: 25px; font-weight: bold; transition: 0.3s; cursor: pointer; border: none; font-size: 14px; }
                    .btn:hover { background: #1ed760; transform: scale(1.05); }
                    .btn-copy { background: #333; color: white; }
                    .btn-copy:hover { background: #444; }
                    .info { font-size: 13px; color: #b3b3b3; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div style="font-size: 40px;">✔</div>
                    <h1>¡Vinculación Exitosa!</h1>
                    <p class="info">Detectado en: <code>${host}</code></p>
                    
                    <div class="token-box">
                        <span class="token-text" id="token">${refresh_token}</span>
                        <button class="btn btn-copy" onclick="copyToken()">Copiar Token</button>
                    </div>

                    <p class="info" style="color: #ffb142;">⚠️ Si estás configurando en la nube, guarda este token en tus variables de entorno como <code>REFRESH_TOKEN</code>.</p>

                    <div class="btn-group">
                        <a href="${baseUrl}/overlays" class="btn">Ir al Overlay</a>
                        <a href="${baseUrl}/" class="btn btn-copy">Volver al Inicio</a>
                    </div>
                </div>

                <script>
                    function copyToken() {
                        const token = document.getElementById('token').innerText;
                        navigator.clipboard.writeText(token).then(() => {
                            alert('Token copiado al portapapeles');
                        });
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

async function getAccessToken() {
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
        return cachedAccessToken;
    }
    if (!refresh_token) {
        console.warn("!!!Sin Refresh Token. Ve a /login");
        return null;
    }
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token,
            }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error_description);
        cachedAccessToken = data.access_token;
        tokenExpiresAt = Date.now() + data.expires_in * 1000;
        return cachedAccessToken;
    } catch (error) {
        console.error("❌ Error renovando token:", error.message);
        return null;
    }
}

app.get("/song", async (req, res) => {
    // 1. ¿Estamos en rate limit? No toques Spotify
    if (Date.now() < rateLimitedUntil) {
        const secsLeft = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
        console.log(`Rate limit activo. Faltan ${secsLeft}s`);
        return res.json(songCache || { playing: false });
    }

    // 2. ¿El caché es fresco? Devuélvelo sin llamar a Spotify
    if (songCache && Date.now() - lastSongFetch < SONG_TTL) {
        return res.json(songCache);
    }

    // 3. Recién aquí llamamos a Spotify
    const token = await getAccessToken();
    if (!token) return res.json(songCache || { playing: false });

    try {
        const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 429) {
            const wait = parseInt(response.headers.get("Retry-After") || "30", 10);
            rateLimitedUntil = Date.now() + wait * 1000;
            console.warn(`Rate limited ${wait}s — hasta ${new Date(rateLimitedUntil).toLocaleTimeString()}`);
            return res.json(songCache || { playing: false });
        }

        if (response.status === 204) {
            songCache = { playing: false };
            lastSongFetch = Date.now();
            return res.json(songCache);
        }

        if (!response.ok) {
            console.error("Spotify respondió:", response.status);
            return res.json(songCache || { playing: false });
        }

        const data = await response.json();

        if (!data?.item || !data.is_playing) {
            songCache = { playing: false };
            lastSongFetch = Date.now();
            return res.json(songCache);
        }

        const coverUrl = data.item.album.images[0]?.url;
        let artistColor = "#1DB954";
        if (coverUrl) {
            try {
                const palette = await Vibrant.from(coverUrl).getPalette();
                artistColor = (palette.Vibrant || palette.LightVibrant || palette.Muted).getHex();
            } catch (_) {}
        }

        songCache = {
            playing: true,
            title: data.item.name,
            artist: data.item.artists.map(a => a.name).join(", "),
            cover: coverUrl,
            artistColor,
            progress_ms: data.progress_ms,
            duration_ms: data.item.duration_ms,
        };
        lastSongFetch = Date.now();
        res.json(songCache);

    } catch (error) {
        console.error("❌ Error en /song:", error.message);
        res.json(songCache || { playing: false });
    }
});

// 🆕 RUTA PARA STREAM ELEMENTS (!sr)
app.get('/add-to-queue', async (req, res) => {
    const songName = req.query.song;
    if (!songName) return res.send("¡¡Indica una canción. Uso: !sr nombre¡¡");

    const token = await getAccessToken();
    if (!token) return res.send("Error de autenticación. El streamer debe loguearse.");

    try {
        // 1. Buscar la canción
        const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('track:' + songName)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchData = await searchRes.json();
        
        if (!searchData.tracks || searchData.tracks.items.length === 0) {
            return res.send("❌ No encontré esa canción en Spotify.");
        }

        const track = searchData.tracks.items[0];
        const trackUri = track.uri;

        // 2. Añadir a la cola
        const queueRes = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${trackUri}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (queueRes.ok) {
            res.send(`Cancion agregada: ${track.name} - ${track.artists[0].name}`);
        } else {
            // Si falla, suele ser porque no hay un dispositivo activo (Spotify cerrado)
            res.send("No se pudo añadir. Asegúrate de que Spotify esté abierto y reproduciendo.");
        }
    } catch (err) {
        console.error("Error en !sr:", err.message);
        res.send("❌ Error interno al procesar la canción.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Cerrando servidor formalmente por actualización...');
    process.exit(0);
});