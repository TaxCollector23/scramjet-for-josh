import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import { Controller, type Frame } from "@mercuryworkshop/scramjet-controller";

declare const $scramjet: any;

const WISP_URL = "wss://wisp.mercurywork.shop/";

let controller: Controller | null = null;
let frame: Frame | null = null;
let controllerReady = false;

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
function toast(msg: string, ms = 3500) {
	toastEl.textContent = msg;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
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
async function ensureController() {
	if (controllerReady) return;
	toast("Starting proxy…", 20_000);

	const reg = await navigator.serviceWorker.register("./sw.js");

	// Wait for the SW to take control (or timeout after 8 s).
	if (!navigator.serviceWorker.controller) {
		await Promise.race([
			new Promise<void>(res => {
				navigator.serviceWorker.addEventListener("controllerchange", () => res(), { once: true });
			}),
			new Promise<void>(res => setTimeout(res, 8000)),
		]);
	}

	const sw = navigator.serviceWorker.controller ?? reg.active;
	if (!sw) throw new Error("No active service worker");

	// Use defaultConfigDev from the already-loaded scramjet.js global to avoid
	// bundling a second copy of scramjet that could conflict.
	const scramjetConfig = typeof $scramjet !== "undefined" ? $scramjet.defaultConfigDev : undefined;

	controller = new Controller({
		serviceworker: sw,
		transport: new LibcurlClient({ wisp: WISP_URL }),
		...(scramjetConfig ? { scramjetConfig } : {}),
	});
	await controller.wait();
	controllerReady = true;
	toastEl.classList.remove("show");
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
		toast(`Error: ${(e as Error).message}`);
		console.error(e);
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

// Auto-focus on load
homeSearch.focus();
