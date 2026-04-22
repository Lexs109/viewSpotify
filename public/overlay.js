// ── CONFIGURACIÓN ─────────────────────────────────────────
const CONFIG = {
    hideDelay: 8000,
    titleSpeed: 40,    // px por segundo
    artistSpeed: 25,   // px por segundo
    pauseAtEnd: 1.5,   // segundos de pausa antes de reiniciar
};

// ── Detecta si es ruta de usuario /u/:uuid/ o ruta legacy ─
// Si la URL es /u/UUID/overlay/1 usa /u/UUID/song
// Si la URL es /overlay/1 (legacy/local) usa /song
const uuidMatch = window.location.pathname.match(/^\/u\/([^/]+)\//);
const songEndpoint = uuidMatch ? `/u/${uuidMatch[1]}/song` : "/song";

let lastSong = "";
let hideTimeout = null;
let localProgress = 0;
let localDuration = 0;

function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Marquee: sale por izquierda, entra por derecha ────────
function applyMarquee(el, speedPxPerSec) {
    if (!el) return;
    const container = el.parentElement;
    if (!container) return;

    el.style.animation = "none";
    el.style.transform = "translateX(0)";
    el.offsetHeight;

    const containerWidth = container.clientWidth;
    const textWidth = el.scrollWidth;
    const overflow = textWidth - containerWidth;

    if (overflow <= 0) return;

    const totalDistance = containerWidth + textWidth;
    const scrollDuration = totalDistance / speedPxPerSec;
    const totalDuration = scrollDuration + CONFIG.pauseAtEnd;
    const scrollPct = ((scrollDuration / totalDuration) * 100).toFixed(1);

    const animName = `marquee_${el.id}_${Date.now()}`;
    let styleEl = document.getElementById('marquee-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'marquee-styles';
        document.head.appendChild(styleEl);
    }

    styleEl.textContent += `
        @keyframes ${animName} {
            0% { transform: translateX(${containerWidth}px); }
            ${scrollPct}% { transform: translateX(-${textWidth}px); }
            ${scrollPct}%, 100% { transform: translateX(-${textWidth}px); }
        }
    `;

    el.style.animation = `${animName} ${totalDuration.toFixed(2)}s linear infinite`;
}

function applyFontSize(el, length) {
    if (!el) return;
    if (length < 15) el.style.fontSize = "38px";
    else if (length < 25) el.style.fontSize = "30px";
    else el.style.fontSize = "24px";
}

function updateProgressBar(progress, duration) {
    const bar = document.getElementById("progress-bar");
    const curr = document.getElementById("time-current");
    const total = document.getElementById("time-total");
    if (bar && duration > 0) bar.style.width = Math.min((progress / duration) * 100, 100) + "%";
    if (curr) curr.innerText = fmt(progress);
    if (total) total.innerText = fmt(duration);
}

setInterval(() => {
    localProgress += 1000;
    updateProgressBar(localProgress, localDuration);
}, 1000);

async function updateSong() {
    try {
        const res = await fetch(songEndpoint);
        const data = await res.json();

        const player = document.getElementById("player");
        if (!player) return;

        if (!data.playing) {
            if (hideTimeout === null) {
                hideTimeout = setTimeout(() => {
                    player.style.opacity = "0";
                    hideTimeout = null;
                }, CONFIG.hideDelay);
            }
            return;
        }

        if (hideTimeout !== null) { clearTimeout(hideTimeout); hideTimeout = null; }
        player.style.opacity = "1";

        localProgress = data.progress_ms || 0;
        localDuration = data.duration_ms || 0;
        updateProgressBar(localProgress, localDuration);

        document.documentElement.style.setProperty('--artist-color', data.artistColor || '#1DB954');

        if (lastSong !== data.title) {
            lastSong = data.title;

            const styleEl = document.getElementById('marquee-styles');
            if (styleEl) styleEl.textContent = '';

            const cover = document.getElementById("cover");
            if (cover) cover.src = data.cover;

            const bgBlur = document.getElementById("bg-blur");
            if (bgBlur) bgBlur.style.backgroundImage = `url(${data.cover})`;

            const artistEl = document.getElementById("artist");
            if (artistEl) {
                artistEl.innerText = data.artist.split(",")[0].trim();
                artistEl.style.color = data.artistColor;
                artistEl.style.whiteSpace = "nowrap";
                setTimeout(() => applyMarquee(artistEl, CONFIG.artistSpeed), 100);
            }

            const titleScroll = document.getElementById("title-scroll");
            if (titleScroll) {
                titleScroll.innerText = data.title;
                titleScroll.style.whiteSpace = "nowrap";
                applyFontSize(titleScroll, data.title.length);
                setTimeout(() => applyMarquee(titleScroll, CONFIG.titleSpeed), 100);
            }

            const titleSimple = document.getElementById("title");
            if (titleSimple) {
                titleSimple.innerText = data.title;
                titleSimple.style.whiteSpace = "nowrap";
                setTimeout(() => applyMarquee(titleSimple, CONFIG.titleSpeed), 100);
            }

            const bar = document.getElementById("progress-bar");
            if (bar) bar.style.background = data.artistColor;

            const blob1 = document.getElementById("blob1");
            if (blob1 && data.artistColor) {
                const r = parseInt(data.artistColor.slice(1,3),16);
                const g = parseInt(data.artistColor.slice(3,5),16);
                const b = parseInt(data.artistColor.slice(5,7),16);
                blob1.style.background = `rgba(${r},${g},${b},0.5)`;
            }
        }

    } catch (err) {
        console.error("Error en el overlay:", err);
    }
}

setInterval(updateSong, 3000);
updateSong();