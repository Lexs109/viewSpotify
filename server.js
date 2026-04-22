import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import Vibrant from "node-vibrant/lib/index.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

if (!process.env.RAILWAY_ENVIRONMENT) dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// ── Base de datos SQLite ──────────────────────────────────
// En Railway usa /data (Volume persistente), en local usa la raíz del proyecto
const DB_PATH = process.env.RAILWAY_ENVIRONMENT ? "/data/database.db" : "./database.db";
const db = new Database(DB_PATH);

// Tabla actualizada con 'spotify_id' único
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        spotify_id TEXT UNIQUE,
        refresh_token TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
    )
`);

console.log(`✅ Base de datos activa en: ${DB_PATH}`);

// ── Cache en memoria por usuario ──────────────────────────
const userCache = {};
function getUserCache(uuid) {
    if (!userCache[uuid]) userCache[uuid] = {
        accessToken: null,
        expiresAt: 0,
        songCache: null,
        lastFetch: 0,
        rateLimitedUntil: 0
    };
    return userCache[uuid];
}

app.use(express.static("public"));

// ── Ruta raíz: landing pública ────────────────────────────
app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/public/index.html");
});

// ── Health check (mantiene vivo Railway) ──────────────────
app.get("/health", (req, res) => res.json({ status: "ok", db: DB_PATH }));

// ── Login: redirige a Spotify ─────────────────────────────
app.get("/login", (req, res) => {
    const host = req.get('host');
    const protocol = process.env.RAILWAY_ENVIRONMENT ? 'https' : req.protocol;
    const dynamicRedirect = `${protocol}://${host}/callback`;

    const scope = "user-read-currently-playing user-modify-playback-state user-read-private";
    const authURL = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope,
        redirect_uri: dynamicRedirect,
    });
    res.redirect(authURL);
});

// ── Callback: guarda en SQLite, redirige al dashboard ─────
app.get("/callback", async (req, res) => {
    const code = req.query.code;
    const host = req.get('host');
    const protocol = process.env.RAILWAY_ENVIRONMENT ? 'https' : req.protocol;
    const dynamicRedirect = `${protocol}://${host}/callback`;
    const baseUrl = `${protocol}://${host}`;

    try {
        // 1. Obtener los tokens
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: dynamicRedirect,
            }),
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(tokenData.error_description);

        // 2. Obtener el perfil del usuario para saber su ID de Spotify
        const profileRes = await fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const profileData = await profileRes.json();
        const spotifyId = profileData.id;

        if (!spotifyId) throw new Error("No se pudo obtener el ID de Spotify");

        // 3. Buscar si el usuario ya existe en la Base de Datos
        let userRow = db.prepare("SELECT id FROM users WHERE spotify_id = ?").get(spotifyId);
        let uuid;

        if (userRow) {
            // Ya existe: Reutilizamos su UUID y actualizamos el token
            uuid = userRow.id;
            db.prepare("UPDATE users SET refresh_token = ? WHERE id = ?").run(tokenData.refresh_token, uuid);
            console.log(`♻️ Usuario existente logueado: ${spotifyId} (${uuid})`);
        } else {
            // Es nuevo: Generamos UUID y guardamos
            uuid = randomUUID();
            db.prepare(`INSERT INTO users (id, spotify_id, refresh_token) VALUES (?, ?, ?)`)
              .run(uuid, spotifyId, tokenData.refresh_token);
            console.log(`✅ Nuevo usuario registrado: ${spotifyId} (${uuid})`);
        }

        // Pre-cargar cache con el access_token recién obtenido
        const cache = getUserCache(uuid);
        cache.accessToken = tokenData.access_token;
        cache.expiresAt   = Date.now() + tokenData.expires_in * 1000;

        res.redirect(`${baseUrl}/u/${uuid}/dashboard`);

    } catch (error) {
        console.error("Error en /callback:", error.message);
        res.status(500).send(`
            <html><body style="background:#121212;color:white;font-family:sans-serif;
            display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
            <div style="text-align:center;">
                <h2 style="color:#ff4757;">❌ Error en login</h2>
                <p>${error.message}</p>
                <a href="/" style="color:#1DB954;">← Volver</a>
            </div></body></html>
        `);
    }
});

// ── Dashboard del usuario ─────────────────────────────────
app.get("/u/:uuid/dashboard", (req, res) => {
    const { uuid } = req.params;

    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(uuid);
    if (!user) return res.status(404).send("Usuario no encontrado");

    const host = req.get('host');
    const protocol = process.env.RAILWAY_ENVIRONMENT ? 'https' : req.protocol;
    const base = `${protocol}://${host}`;
    const overlaysUrl = `${base}/u/${uuid}/overlays`;
// ... (dentro de app.get("/u/:uuid/dashboard"))

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tu Dashboard · Spotify Overlay</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
    :root { --green:#1DB954; --bg:#0a0a0a; --surface:#141414; --border:#222; --muted:#555; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:#e8e8e8; font-family:'Syne',sans-serif;
           min-height:100vh; display:flex; flex-direction:column;
           align-items:center; justify-content:center; padding:40px 20px; }
    .card { background:var(--surface); border:1px solid var(--border);
            border-radius:16px; padding:40px; max-width:600px; width:100%; text-align:center; }
    h1 { font-size:22px; font-weight:800; color:var(--green); margin-bottom:8px; }
    .btn { display:flex; align-items:center; justify-content:center; gap:10px;
           width:100%; padding:14px 24px; border-radius:10px; font-family:'Syne',sans-serif;
           font-weight:700; font-size:15px; text-decoration:none; cursor:pointer;
           border:none; transition:all 0.2s; margin-bottom:12px; }
    .btn-primary { background:var(--green); color:#000; }

    .command-box { background:#000; border:1px solid var(--border); border-radius:8px; 
                   padding:15px; margin:20px 0; text-align:left; position:relative; }
    .command-text { font-family:'Space Mono',monospace; font-size:12px; color:#aaa; 
                    word-break:break-all; display:block; margin-top:10px; }
    .command-label { font-size:11px; color:var(--green); font-weight:700; text-transform:uppercase; }
    .copy-mini { position:absolute; top:10px; right:10px; background:var(--border); 
                 color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; }
</style>
</head>
<body>
<div class="card">
    <h1>¡Configuración Completa!</h1>
    <br>
    <a href="${overlaysUrl}" class="btn btn-primary">Ver mis Overlays para OBS</a>
    <div class="command-box">
        <span class="command-label">Comando para StreamElements</span>
        <button class="copy-mini" onclick="copyCommand()">Copiar</button>
        <code class="command-text" id="srCommand">
            \${customapi.${base}/u/${uuid}/add-to-queue?song=\${queryencode \${1:}}}
        </code>
    </div>

    <p style="font-size:12px; color:var(--muted);">Copia el código de arriba y pégalo en la sección "Reply" de tu comando !sr en StreamElements.</p>

    <hr style="border:none; border-top:1px solid var(--border); margin:20px 0;">
    <div style="font-size:11px; color:var(--muted);">TU ID ÚNICO: <span style="color:#444;">${uuid}</span></div>
</div>

<script>
function copyCommand() {
    const text = document.getElementById('srCommand').innerText.trim();
    navigator.clipboard.writeText(text);
    alert('¡Comando copiado!');
}
</script>
</body>
</html>`);
});

// ── Galería de overlays por usuario ──────────────────────
app.get("/u/:uuid/overlays", (req, res) => {
    const { uuid } = req.params;
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(uuid);
    if (!user) return res.status(404).send("Usuario no encontrado");
    res.sendFile(process.cwd() + "/public/overlays.html");
});

// ── Overlay individual por usuario ────────────────────────
app.get("/u/:uuid/overlay/:id", (req, res) => {
    const { uuid, id } = req.params;
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(uuid);
    if (!user) return res.status(404).send("Usuario no encontrado");

    const file = `${process.cwd()}/public/overlay${id}.html`;
    fs.existsSync(file)
        ? res.sendFile(file)
        : res.status(404).send("Overlay no encontrado");
});

// ── /song por usuario ─────────────────────────────────────
app.get("/u/:uuid/song", async (req, res) => {
    const { uuid } = req.params;
    const cache = getUserCache(uuid);

    if (Date.now() < cache.rateLimitedUntil)
        return res.json(cache.songCache || { playing: false });

    if (cache.songCache && Date.now() - cache.lastFetch < 3000)
        return res.json(cache.songCache);

    const token = await getAccessTokenForUser(uuid);
    if (!token) return res.json(cache.songCache || { playing: false });

    try {
        const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 429) {
            const wait = parseInt(response.headers.get("Retry-After") || "30", 10);
            cache.rateLimitedUntil = Date.now() + wait * 1000;
            console.warn(`Rate limited ${wait}s`);
            return res.json(cache.songCache || { playing: false });
        }

        if (response.status === 204 || !response.ok) {
            cache.songCache = { playing: false };
            cache.lastFetch = Date.now();
            return res.json(cache.songCache);
        }

        const data = await response.json();

        if (!data?.item || !data.is_playing) {
            cache.songCache = { playing: false };
            cache.lastFetch = Date.now();
            return res.json(cache.songCache);
        }

        const coverUrl = data.item.album.images[0]?.url;
        let artistColor = "#1DB954";
        if (coverUrl) {
            try {
                const palette = await Vibrant.from(coverUrl).getPalette();
                artistColor = (palette.Vibrant || palette.LightVibrant || palette.Muted).getHex();
            } catch (_) {}
        }

        cache.songCache = {
            playing: true,
            title: data.item.name,
            artist: data.item.artists.map(a => a.name).join(", "),
            cover: coverUrl,
            artistColor,
            progress_ms: data.progress_ms,
            duration_ms: data.item.duration_ms,
        };
        cache.lastFetch = Date.now();
        res.json(cache.songCache);

    } catch (err) {
        console.error("Error en /song:", err.message);
        res.json(cache.songCache || { playing: false });
    }
});

// ── Cola de canciones (!sr) por usuario ──────────────────
app.get("/u/:uuid/add-to-queue", async (req, res) => {
    const { uuid } = req.params;
    const songName = req.query.song;
    if (!songName) return res.send("Uso: !sr nombre de canción");

    const token = await getAccessTokenForUser(uuid);
    if (!token) return res.send("Error de autenticación. El streamer debe loguearse.");

    try {
        const searchRes = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent("track:" + songName)}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (!searchData.tracks?.items.length)
            return res.send("❌ No encontré esa canción en Spotify.");

        const track = searchData.tracks.items[0];
        const queueRes = await fetch(
            `https://api.spotify.com/v1/me/player/queue?uri=${track.uri}`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );

        queueRes.ok
            ? res.send(`✅ Canción agregada: ${track.name} - ${track.artists[0].name}`)
            : res.send("No se pudo añadir. Asegúrate de que Spotify esté abierto y reproduciendo.");

    } catch (err) {
        console.error("Error en add-to-queue:", err.message);
        res.send("❌ Error interno al procesar la canción.");
    }
});

// ── Helper: access token por usuario ─────────────────────
async function getAccessTokenForUser(uuid) {
    const cache = getUserCache(uuid);

    if (cache.accessToken && Date.now() < cache.expiresAt - 60_000)
        return cache.accessToken;

    const user = db.prepare("SELECT refresh_token FROM users WHERE id = ?").get(uuid);
    if (!user) {
        console.warn("Usuario no encontrado en DB:", uuid);
        return null;
    }

    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: user.refresh_token,
            }),
        });

        const tokenData = await response.json();
        if (tokenData.error) throw new Error(tokenData.error_description);

        cache.accessToken = tokenData.access_token;
        cache.expiresAt   = Date.now() + tokenData.expires_in * 1000;
        return cache.accessToken;

    } catch (err) {
        console.error("Error renovando token para", uuid, err.message);
        return null;
    }
}

// ── Servidor ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor activo en puerto ${PORT}`);
});

process.on('SIGTERM', () => {
    db.close();
    console.log('Servidor cerrado correctamente.');
    process.exit(0);
});