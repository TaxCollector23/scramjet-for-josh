import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import { Controller, type Frame } from "@mercuryworkshop/scramjet-controller";

declare const $scramjet: any;

const WISP_URL = "wss://wisp.mercurywork.shop/";

let controller: Controller | null = null;
let frame: Frame | null = null;
let controllerReady = false;
let initPromise: Promise<void> | null = null;

// ── Elements ──────────────────────────────────────────────────────────────────
const homeEl     = document.getElementById("home")!;
const browserEl  = document.getElementById("browser")!;
const clockEl    = document.getElementById("clock")!;
const dateEl     = document.getElementById("date-label")!;
const homeSearch = document.getElementById("home-search") as HTMLInputElement;
const urlInput   = document.getElementById("url-input") as HTMLInputElement;
const urlForm    = document.getElementById("url-form") as HTMLFormElement;
const btnBack    = document.getElementById("btn-back") as HTMLButtonElement;
const btnFwd     = document.getElementById("btn-fwd") as HTMLButtonElement;
const btnReload  = document.getElementById("btn-reload") as HTMLButtonElement;
const btnHome    = document.getElementById("btn-home") as HTMLButtonElement;
const iframe     = document.getElementById("proxy-frame") as HTMLIFrameElement;
const toastEl    = document.getElementById("toast")!;

// ── Clock ─────────────────────────────────────────────────────────────────────
function tick() {
	const now = new Date();
	clockEl.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
tick();
setInterval(tick, 15_000);

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout>;
function toast(msg: string, ms = 4000) {
	toastEl.textContent = msg;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	if (ms > 0) toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}
function clearToast() { toastEl.classList.remove("show"); }

// ── Error overlay ─────────────────────────────────────────────────────────────
function showError(msg: string) {
	// Show error inside the proxy iframe area so it's unmissable
	iframe.srcdoc = `<!doctype html><html><body style="margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#ef4444;flex-direction:column;gap:12px;text-align:center;padding:20px">
		<div style="font-size:2rem">⚠️</div>
		<div style="font-size:1rem;font-weight:600">Proxy error</div>
		<div style="font-size:.85rem;color:#9ca3af;max-width:380px">${msg}</div>
		<button onclick="parent.location.reload()" style="margin-top:8px;padding:8px 18px;background:#1e1e1e;border:1px solid #333;color:#e5e7eb;border-radius:6px;cursor:pointer;font-size:.85rem">Reload page</button>
	</body></html>`;
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function toUrl(raw: string): string {
	const s = raw.trim();
	if (!s) return "";
	if (/^(https?|ftp):\/\//i.test(s)) return s;
	if (/^[\w-]+(\.[\w-]+)+/.test(s) && !s.includes(" ")) return `https://${s}`;
	return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

// ── Show / hide screens ───────────────────────────────────────────────────────
function showBrowser() {
	homeEl.classList.add("gone");
	browserEl.classList.add("on");
}
function showHome() {
	browserEl.classList.remove("on");
	homeEl.classList.remove("gone");
	homeSearch.value = "";
	homeSearch.focus();
}

// ── Controller init ───────────────────────────────────────────────────────────
async function _initController() {
	if (!("serviceWorker" in navigator)) {
		throw new Error("Service workers are not supported in this browser.");
	}

	toast("Starting proxy…", -1); // persistent until cleared

	const reg = await navigator.serviceWorker.register("./sw.js");

	// skipWaiting() in the SW means the new SW activates immediately.
	// clients.claim() makes it take control of this page right away.
	// So controllerchange fires almost instantly on first install.
	if (!navigator.serviceWorker.controller) {
		await new Promise<void>((res, rej) => {
			const t = setTimeout(() => rej(new Error("Service worker timed out. Try reloading the page.")), 15000);
			navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(t); res(); }, { once: true });
		});
	}

	const sw = navigator.serviceWorker.controller!;

	// Read defaultConfigDev from the $scramjet global set by scramjet.js
	// (avoids bundling a second copy of scramjet that would conflict).
	const scramjetConfig = typeof $scramjet !== "undefined" ? $scramjet.defaultConfigDev : undefined;

	controller = new Controller({
		serviceworker: sw,
		transport: new LibcurlClient({ wisp: WISP_URL }),
		...(scramjetConfig ? { scramjetConfig } : {}),
	});

	await controller.wait();
	controllerReady = true;
	clearToast();
}

function ensureController(): Promise<void> {
	if (controllerReady) return Promise.resolve();
	if (!initPromise) initPromise = _initController().catch(e => {
		initPromise = null; // allow retry on next navigate
		throw e;
	});
	return initPromise;
}

// ── Navigate ──────────────────────────────────────────────────────────────────
async function navigate(raw: string) {
	const url = toUrl(raw);
	if (!url) return;
	showBrowser();
	urlInput.value = url;
	try {
		await ensureController();
		if (!frame) {
			frame = controller!.createFrame(iframe);
		}
		frame.go(url);
	} catch (e) {
		const msg = (e as Error).message ?? String(e);
		showError(msg);
		console.error("[joshaldo]", e);
	}
}

// ── Events ────────────────────────────────────────────────────────────────────
homeSearch.addEventListener("keydown", e => {
	if (e.key === "Enter") { e.preventDefault(); navigate(homeSearch.value); }
});

urlForm.addEventListener("submit", e => {
	e.preventDefault();
	navigate(urlInput.value);
});

btnBack.addEventListener("click",   () => frame?.back());
btnFwd.addEventListener("click",    () => frame?.forward());
btnReload.addEventListener("click", () => frame?.reload());
btnHome.addEventListener("click",   showHome);

homeSearch.focus();
