import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import { Controller, type Frame } from "@mercuryworkshop/scramjet-controller";
import { defaultConfigDev } from "@mercuryworkshop/scramjet";

const WISP_URL = "wss://wisp.mercurywork.shop/";

let controller: Controller | null = null;
let frame: Frame | null = null;
let controllerReady = false;

const app = document.getElementById("app")!;

// ── UI template ──────────────────────────────────────────────────────────────

app.innerHTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --surface: #111;
    --border: #222;
    --text: #e5e7eb;
    --muted: #6b7280;
    --accent: #6366f1;
    --accent-hover: #818cf8;
    --bar-h: 44px;
  }

  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; height: 100vh; overflow: hidden; }

  /* ── New-tab home ── */
  #home {
    position: fixed; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0; padding: 0 16px;
    transition: opacity .2s, transform .2s;
    z-index: 10;
  }
  #home.hidden { opacity: 0; pointer-events: none; transform: translateY(-8px); }

  #clock {
    font-size: clamp(3rem, 10vw, 5.5rem);
    font-weight: 200;
    letter-spacing: -.04em;
    color: var(--text);
    line-height: 1;
    margin-bottom: .15em;
    font-variant-numeric: tabular-nums;
  }
  #date-label {
    font-size: .95rem;
    color: var(--muted);
    margin-bottom: 2.4rem;
    letter-spacing: .02em;
  }

  #home-search-wrap {
    width: min(560px, 100%);
    position: relative;
  }
  #home-search-wrap::before {
    content: '🔍';
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    font-size: 14px; pointer-events: none;
    filter: grayscale(1) opacity(.5);
  }
  #home-search {
    width: 100%;
    padding: 14px 48px 14px 40px;
    background: #161616;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
    font-size: 1rem;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  #home-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
  #home-search::placeholder { color: var(--muted); }

  /* ── Browser chrome ── */
  #browser { position: fixed; inset: 0; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity .2s; }
  #browser.visible { opacity: 1; pointer-events: all; }

  #bar {
    height: var(--bar-h);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 4px;
    padding: 0 8px;
    flex-shrink: 0;
  }
  .nav-btn {
    width: 30px; height: 30px;
    background: transparent; border: none; border-radius: 6px;
    color: var(--muted); cursor: pointer; font-size: 16px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .1s, color .1s;
    flex-shrink: 0;
  }
  .nav-btn:hover { background: #1e1e1e; color: var(--text); }
  .nav-btn:disabled { opacity: .35; cursor: default; }
  .nav-btn:disabled:hover { background: transparent; color: var(--muted); }

  #url-form { flex: 1; min-width: 0; }
  #url-input {
    width: 100%;
    padding: 5px 10px;
    background: #161616;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: .875rem;
    outline: none;
    transition: border-color .15s;
  }
  #url-input:focus { border-color: var(--accent); }

  #home-btn {
    width: 30px; height: 30px;
    background: transparent; border: none; border-radius: 6px;
    color: var(--muted); cursor: pointer; font-size: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .1s, color .1s;
    flex-shrink: 0;
  }
  #home-btn:hover { background: #1e1e1e; color: var(--text); }

  #proxy-frame {
    flex: 1; border: none; background: white; min-height: 0;
  }

  /* ── Status overlay ── */
  #status {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #111; border: 1px solid var(--border);
    color: var(--muted); font-size: .8rem;
    padding: 6px 14px; border-radius: 20px;
    pointer-events: none; opacity: 0;
    transition: opacity .2s;
    white-space: nowrap;
    z-index: 100;
  }
  #status.show { opacity: 1; }
</style>

<!-- Home / new-tab screen -->
<div id="home">
  <div id="clock">00:00</div>
  <div id="date-label">Monday, January 1</div>
  <div id="home-search-wrap">
    <input id="home-search" type="text" placeholder="Search or enter address…" autocomplete="off" spellcheck="false" />
  </div>
</div>

<!-- Browser chrome + iframe -->
<div id="browser">
  <div id="bar">
    <button class="nav-btn" id="btn-back" title="Back" disabled>&#8592;</button>
    <button class="nav-btn" id="btn-fwd" title="Forward" disabled>&#8594;</button>
    <button class="nav-btn" id="btn-reload" title="Reload">&#8635;</button>
    <form id="url-form">
      <input id="url-input" type="text" placeholder="Search or enter address…" autocomplete="off" spellcheck="false" />
    </form>
    <button id="home-btn" title="New tab">&#8962;</button>
  </div>
  <iframe id="proxy-frame" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-presentation"></iframe>
</div>

<div id="status"></div>
`;

// ── Elements ──────────────────────────────────────────────────────────────────
const homeEl    = document.getElementById("home")!;
const browserEl = document.getElementById("browser")!;
const clockEl   = document.getElementById("clock")!;
const dateLabelEl = document.getElementById("date-label")!;
const homeSearch = document.getElementById("home-search") as HTMLInputElement;
const urlInput  = document.getElementById("url-input") as HTMLInputElement;
const urlForm   = document.getElementById("url-form") as HTMLFormElement;
const btnBack   = document.getElementById("btn-back") as HTMLButtonElement;
const btnFwd    = document.getElementById("btn-fwd") as HTMLButtonElement;
const btnReload = document.getElementById("btn-reload") as HTMLButtonElement;
const homeBtn   = document.getElementById("home-btn") as HTMLButtonElement;
const proxyFrame = document.getElementById("proxy-frame") as HTMLIFrameElement;
const statusEl  = document.getElementById("status")!;

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  clockEl.textContent = `${h}:${m}`;
  dateLabelEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
updateClock();
setInterval(updateClock, 10000);

// ── Status toast ─────────────────────────────────────────────────────────────
let statusTimer: ReturnType<typeof setTimeout> | null = null;
function showStatus(msg: string, duration = 3000) {
  statusEl.textContent = msg;
  statusEl.classList.add("show");
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("show"), duration);
}

// ── Resolve query → URL ───────────────────────────────────────────────────────
function resolveUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^(https?|ftp|file):\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed) && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ── Controller init ───────────────────────────────────────────────────────────
async function initController() {
  if (controllerReady) return;
  showStatus("Starting proxy…", 15000);
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    await new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) return resolve();
      const onChange = () => { navigator.serviceWorker.removeEventListener("controllerchange", onChange); resolve(); };
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      setTimeout(resolve, 8000);
    });
    const sw = navigator.serviceWorker.controller ?? reg.active;
    if (!sw) throw new Error("No service worker available");
    controller = new Controller({ serviceworker: sw, transport: new LibcurlClient({ wisp: WISP_URL }), scramjetConfig: defaultConfigDev });
    await controller!.wait();
    controllerReady = true;
    statusEl.classList.remove("show");
  } catch (e) {
    showStatus(`Proxy error: ${(e as Error).message}`);
    throw e;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showBrowser() {
  homeEl.classList.add("hidden");
  browserEl.classList.add("visible");
}

function showHome() {
  browserEl.classList.remove("visible");
  homeEl.classList.remove("hidden");
  homeSearch.value = "";
  setTimeout(() => homeSearch.focus(), 50);
}

async function navigate(rawUrl: string) {
  const url = resolveUrl(rawUrl);
  if (!url) return;
  showBrowser();
  urlInput.value = url;
  try {
    await initController();
    if (!frame) {
      frame = controller!.createFrame(proxyFrame);
    }
    frame.go(url);
  } catch (e) {
    showStatus(`Failed to load: ${(e as Error).message}`);
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────
homeSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    navigate(homeSearch.value);
  }
});

urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(urlInput.value);
});

btnBack.addEventListener("click", () => frame?.back());
btnFwd.addEventListener("click",  () => frame?.forward());
btnReload.addEventListener("click", () => frame?.reload());
homeBtn.addEventListener("click", showHome);

// Update URL bar when the frame navigates
navigator.serviceWorker.addEventListener("message", (e) => {
  if (e.data?.url && frame) {
    urlInput.value = e.data.url;
  }
});

// Focus home search on load
homeSearch.focus();
