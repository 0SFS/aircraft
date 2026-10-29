import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluate, openHeadlessChrome, waitForExpression } from "../../fly/scripts/headless-chrome.mjs";
import { newOutputDirectory } from "../../fly/scripts/outputDirectory.mjs";

// This is deliberately a static selector/layout check. The production-runtime
// switch check separately proves that the FDM, model and retained world change.
const root = fileURLToPath(new URL("../../fly/", import.meta.url));
const requireFromApp = createRequire(new URL("../../fly/package.json", import.meta.url));
const { build, defaultClientConditions } = await import(pathToFileURL(requireFromApp.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(requireFromApp.resolve("@vitejs/plugin-react")).href);
const outArg = process.argv.slice(2).find(arg => arg.startsWith("--out="))?.slice(6);
const out = outArg ? path.resolve(outArg) : newOutputDirectory("validation", "aircraft-selection");
if (outArg) await mkdir(out); // Keep every run's earlier evidence.
const fixtureRoot = path.join(out, "fixture");
const bundleRoot = path.join(out, "bundle");
await mkdir(fixtureRoot);
const importPath = relative => JSON.stringify(path.join(root, relative));
const fixture = [
  "import " + importPath("src/flight/aircraft/fleet.ts") + ";",
  "import {AircraftSelectionPanel} from '@0sfs/aircraft/AircraftSelectionPanel';",
  "import {normalizeAircraftSelection} from '@0sfs/aircraft/aircraftCatalog';",
  "import {useState} from 'react';import {createRoot} from 'react-dom/client';",
  "import " + importPath("src/styles/globe.css") + ";",
  "import " + importPath("src/styles/flight.css") + ";",
  "localStorage.removeItem('0sfs.aircraft-switch.skip-confirmation');",
  "const initial={aircraftId:'cirrus-vision-jet-g2',generationId:'g2',lodId:'auto',modelStatus:'ready',modelActiveLodId:'lod3',modelTriangles:1654,modelError:null};",
  "window.__aircraftFixture={applied:[],finish:null,scope:'Real selector, fleet and CSS; static snapshots and controlled switch promise; no FDM or world'};",
  "function Fixture(){const [snapshot,setSnapshot]=useState(initial),[selection,setSelection]=useState(normalizeAircraftSelection(initial)),[switching,setSwitching]=useState(false);",
  "const apply=next=>{window.__aircraftFixture.applied.push(next);setSwitching(true);return new Promise(resolve=>{window.__aircraftFixture.finish=error=>{if(!error){setSnapshot(previous=>({...previous,...next}));}setSwitching(false);window.__aircraftFixture.finish=null;resolve(error??null);};});};",
  "return <AircraftSelectionPanel snapshot={snapshot} selection={selection} onSelectionChange={setSelection} onFamilyChange={()=>{}} onApply={apply} switching={switching}/>;}",
  "createRoot(document.getElementById('panel')).render(<Fixture/>);",
].join("\n");
await writeFile(path.join(fixtureRoot, "entry.tsx"), fixture);
await writeFile(path.join(fixtureRoot, "index.html"), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aircraft selector static acceptance fixture</title><style>html,body{margin:0;min-height:100%;background:#182631}*{box-sizing:border-box}.fixture-panel{position:fixed;top:16px;right:16px;width:480px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #536371;border-radius:9px;background:#10191f;padding:12px;color:#e6edef;font:13px system-ui,sans-serif}</style><div class="flight-app"><div class="fixture-panel flight-panel__content" id="panel"></div></div><script type="module" src="/entry.tsx"></script>');
await build({
  configFile: false, root: fixtureRoot, publicDir: false, base: "/",
  plugins: [react()], logLevel: "warn",
  resolve: {
    preserveSymlinks: true,
    conditions: ["source", ...defaultClientConditions],
    alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") },
    dedupe: ["react", "react-dom", "foss-earth", "lucide-react", "@babylonjs/core", "@babylonjs/loaders", "3d-tiles-renderer"],
  },
  build: { outDir: bundleRoot, emptyOutDir: false, minify: false },
});

const failures = [], network = [], browserErrors = [], results = [];
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const detach = chrome.onEvent(message => {
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  void (async () => {
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (url.origin !== "https://0sfs.test") {
      failures.push("Unexpected external fixture request: " + request.url);
      await chrome.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, message.sessionId);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const base = pathname.startsWith("/aircraft/thumbnails/") ? path.join(root, "public") : bundleRoot;
    const file = path.resolve(base, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(base + path.sep)) throw new Error("Unsafe fixture request");
    try {
      const bytes = await readFile(file);
      network.push({ path: pathname, sha256: createHash("sha256").update(bytes).digest("hex") });
      await chrome.send("Fetch.fulfillRequest", {
        requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" }, { name: "Cache-Control", value: "no-store" }],
        body: bytes.toString("base64"),
      }, message.sessionId);
    } catch (error) {
      if (pathname !== "/favicon.ico") failures.push("Fixture request failed: " + pathname + ": " + error.message);
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
    }
  })().catch(error => failures.push(error.message));
});

const dialogGeometry = `(() => {const dialog=document.querySelector('dialog[open]'),r=dialog.getBoundingClientRect();return {modal:dialog.matches(':modal'),fullscreen:Math.abs(r.left)<1&&Math.abs(r.top)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1,focusContained:dialog.contains(document.activeElement),contentFits:dialog.scrollWidth<=dialog.clientWidth&&dialog.scrollHeight<=dialog.clientHeight,buttons:Array.from(dialog.querySelectorAll('button'),button=>({text:button.textContent,height:button.getBoundingClientRect().height})),bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};})()`;
const currentGeometry = `(() => {const group=document.querySelector('.flight-panel__aircraft-current'),r=group.getBoundingClientRect(),s=getComputedStyle(group),image=group.querySelector('img'),button=group.querySelector('button');return {roundedEnclosure:parseFloat(s.borderRadius)>0&&parseFloat(s.borderTopWidth)>0&&s.borderTopStyle==='solid',childrenContained:Array.from(group.children).every(child=>{const c=child.getBoundingClientRect();return c.left>=r.left&&c.right<=r.right&&c.top>=r.top&&c.bottom<=r.bottom}),image:image?.getAttribute('src'),imageLoaded:!!image?.naturalWidth,genericIcon:!!group.querySelector('svg'),action:button.textContent.trim(),name:group.querySelector('strong').textContent};})()`;
const noApply = `!Array.from(document.querySelectorAll('button')).some(button=>/Apply|reload/i.test(button.textContent))&&!/Changes pending|until you apply/i.test(document.body.innerText)`;
try {
  for (const viewport of [
    { name: "wide", width: 1440, height: 900 },
    { name: "narrow", width: 360, height: 760 },
    { name: "short", width: 740, height: 360 },
  ]) {
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
    await chrome.send("Runtime.enable", {}, sessionId);
    await chrome.send("Page.enable", {}, sessionId);
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await chrome.send("Page.navigate", { url: "https://0sfs.test/" }, sessionId);
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__generation-field select'))");
    await waitForExpression(chrome, sessionId, "Array.from(document.images).every(image=>image.complete&&image.naturalWidth>0)");
    const key = async (name, code) => {
      await chrome.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code, ...(name === "Enter" ? { text: "\r" } : {}) }, sessionId);
      await chrome.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, sessionId);
    };
    const shot = async suffix => {
      const screenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      const filename = viewport.name + "-" + suffix + ".png";
      await writeFile(path.join(out, filename), Buffer.from(screenshot.data, "base64"));
      return filename;
    };
    const clickText = async text => evaluate(chrome, sessionId, `Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(text)}).click()`);
    const openGallery = async () => {
      await evaluate(chrome, sessionId, "document.querySelector('.flight-panel__aircraft-current button').focus()");
      await key("Enter", 13);
      await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__aircraft-gallery'))");
      await waitForExpression(chrome, sessionId, "Array.from(document.images).every(image=>image.complete&&image.naturalWidth>0)");
    };
    const choose = async name => {
      await evaluate(chrome, sessionId, `(()=>{const button=document.querySelector('[aria-label="Switch to ${name}"]');button.scrollIntoView({block:'nearest'});button.focus();})()`);
      await key("Enter", 13);
    };

    const initial = await evaluate(chrome, sessionId, `({...${currentGeometry},galleryHidden:!document.querySelector('.flight-panel__aircraft-gallery'),controlsVisible:!!document.querySelector('.flight-panel__aircraft-controls'),noApply:${noApply},fits:document.documentElement.scrollWidth<=innerWidth})`);
    const screenshots = [await shot("edit")];
    await openGallery();
    const gallery = await evaluate(chrome, sessionId, "(()=>{const gallery=document.querySelector('.flight-panel__aircraft-gallery'),r=gallery.getBoundingClientRect(),current=gallery.querySelector('button.is-selected'),edit=current.querySelector('.flight-panel__command'),c=current.getBoundingClientRect(),e=edit.getBoundingClientRect();return {buttons:gallery.querySelectorAll('button').length,radios:gallery.querySelectorAll('input[type=radio]').length,settingsHidden:!document.querySelector('.flight-panel__aircraft-controls'),summaryHidden:!document.querySelector('.flight-panel__aircraft-current'),name:current.querySelector('strong').textContent,image:current.querySelector('img').getAttribute('src'),editText:edit.textContent.trim(),editLabel:current.getAttribute('aria-label'),editBottomRight:e.right<=c.right&&c.right-e.right<=10&&e.bottom<=c.bottom&&c.bottom-e.bottom<=10,nestedButtons:gallery.querySelectorAll('button button').length,scrollable:getComputedStyle(gallery).overflowY==='auto',fits:r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth};})()");
    screenshots.push(await shot("gallery"));
    await evaluate(chrome, sessionId, "document.querySelector('button.flight-panel__aircraft-card.is-selected').focus()");
    await key("Enter", 13);
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__aircraft-current'))");
    const editedCurrent = await evaluate(chrome, sessionId, "!document.querySelector('.flight-panel__aircraft-gallery')&&!!document.querySelector('.flight-panel__aircraft-controls')&&window.__aircraftFixture.applied.length===0&&!document.querySelector('dialog[open]')");
    // Pointer clicks on any visible child use the same native card action.
    let cardPartsEdit = true;
    for (const part of ['img', 'strong', '.flight-panel__aircraft-card-footer > span:first-child', '.flight-panel__command']) {
      await openGallery();
      await evaluate(chrome, sessionId, `document.querySelector('button.flight-panel__aircraft-card.is-selected').querySelector(${JSON.stringify(part)}).click()`);
      await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__aircraft-current'))");
      cardPartsEdit &&= await evaluate(chrome, sessionId, "window.__aircraftFixture.applied.length===0&&!document.querySelector('dialog[open]')");
    }
    await openGallery();
    await choose("Cessna 172 Skyhawk");
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('dialog[open]'))");
    const warning = await evaluate(chrome, sessionId, dialogGeometry);
    screenshots.push(await shot("confirm"));
    for (let count = 0; count < 5; count++) await key("Tab", 9);
    const focusTrapped = await evaluate(chrome, sessionId, "document.querySelector('dialog').contains(document.activeElement)");
    await key("Escape", 27);
    await waitForExpression(chrome, sessionId, "!document.querySelector('dialog[open]')");
    const cancelled = await evaluate(chrome, sessionId, "window.__aircraftFixture.applied.length===0");
    await choose("Cessna 172 Skyhawk");
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('dialog[open]'))");
    await clickText("Confirm");
    await waitForExpression(chrome, sessionId, "window.__aircraftFixture.applied.length===1");
    const loading = await evaluate(chrome, sessionId, `({busy:document.querySelector('.flight-panel__aircraft-picker').getAttribute('aria-busy')==='true',disabled:document.querySelector('.flight-panel__aircraft-current button').disabled&&Array.from(document.querySelectorAll('select')).every(select=>select.disabled),warningClosed:!document.querySelector('dialog[open]'),name:document.querySelector('.flight-panel__aircraft-current strong').textContent,noApply:${noApply}})`);
    screenshots.push(await shot("loading"));
    await evaluate(chrome, sessionId, "window.__aircraftFixture.finish(null)");
    await waitForExpression(chrome, sessionId, "document.querySelector('.flight-panel__aircraft-current strong').textContent==='Cessna 172 Skyhawk'&&!document.querySelector('.flight-panel__aircraft-current button').disabled");

    await openGallery();
    await choose("Lockheed Martin F-35B Lightning II");
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('dialog[open]'))");
    await evaluate(chrome, sessionId, "document.querySelector('dialog input[type=checkbox]').click()");
    await clickText("Confirm");
    await waitForExpression(chrome, sessionId, "window.__aircraftFixture.applied.length===2");
    await evaluate(chrome, sessionId, "window.__aircraftFixture.finish('Aircraft: f-35b\\nModel request failed: HTTP 404\\nFlight remains paused.')");
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.foss-earth-issue-report__text'))");
    await evaluate(chrome, sessionId, "document.querySelector('[role=tab][data-file=\"failure.txt\"]').click()");
    const error = await evaluate(chrome, sessionId, `({...${dialogGeometry},report:document.querySelector('.foss-earth-issue-report__text').textContent,oldAircraftRetained:document.querySelector('.flight-panel__aircraft-current strong').textContent==='Cessna 172 Skyhawk'})`);
    screenshots.push(await shot("error"));
    await clickText("Close");
    await openGallery();
    await choose("Cirrus Vision Jet");
    await waitForExpression(chrome, sessionId, "window.__aircraftFixture.applied.length===3");
    const suppressed = await evaluate(chrome, sessionId, "!document.querySelector('dialog[open]')&&localStorage.getItem('0sfs.aircraft-switch.skip-confirmation')==='true'");
    await evaluate(chrome, sessionId, "window.__aircraftFixture.finish(null)");
    await waitForExpression(chrome, sessionId, "!document.querySelector('.flight-panel__aircraft-current button').disabled");
    await evaluate(chrome, sessionId, "(()=>{const select=document.querySelector('.flight-panel__model-controls select');select.value='hd';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitForExpression(chrome, sessionId, "window.__aircraftFixture.applied.length===4");
    const directDetail = await evaluate(chrome, sessionId, "!document.querySelector('dialog[open]')&&window.__aircraftFixture.applied[3].lodId==='hd'");
    await evaluate(chrome, sessionId, "window.__aircraftFixture.finish(null)");
    await waitForExpression(chrome, sessionId, "!document.querySelector('.flight-panel__aircraft-current button').disabled");
    const noPending = await evaluate(chrome, sessionId, noApply);
    const passed = initial.galleryHidden && initial.controlsVisible && initial.noApply && initial.fits
      && initial.roundedEnclosure && initial.childrenContained && initial.imageLoaded && !initial.genericIcon && initial.action === "Switch" && initial.image.endsWith("/cirrus-vision-jet.png")
      && gallery.buttons === 3 && gallery.radios === 0 && gallery.settingsHidden && gallery.scrollable && gallery.fits
      && gallery.summaryHidden && gallery.name === initial.name && gallery.image === initial.image && gallery.editText === "Edit" && gallery.editLabel === `Edit ${initial.name}` && gallery.editBottomRight && gallery.nestedButtons === 0 && editedCurrent && cardPartsEdit
      && warning.modal && warning.fullscreen && warning.focusContained && warning.contentFits && warning.buttons.every(button => button.height >= 44)
      && focusTrapped && cancelled && loading.busy && loading.disabled && loading.warningClosed && loading.noApply
      && error.modal && error.fullscreen && error.contentFits && error.report.includes("HTTP 404") && error.oldAircraftRetained
      && suppressed && directDetail && noPending;
    results.push({ ...viewport, passed, initial, gallery, editedCurrent, cardPartsEdit, warning, focusTrapped, cancelled, loading, error, suppressed, directDetail, noPending, screenshots });
    await chrome.send("Target.closeTarget", { targetId });
  }
} catch (error) { failures.push(error.stack ?? error.message); } finally { detach(); await chrome.close(); }
const report = {
  schemaVersion: 2, generatedAt: new Date().toISOString(),
  scope: "Actual aircraft selector, fleet and production CSS in a static panel shell. Controlled promises and snapshots; no physics, world, mesh loading or pause gate proof.",
  serverStarted: false, visibleBrowserUsed: false, results, network, browserErrors, failures,
  passed: results.length === 3 && results.every(result => result.passed) && failures.length === 0 && browserErrors.length === 0,
};
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ passed: report.passed, report: path.join(out, "report.json"), results: results.map(({ name, passed }) => ({ name, passed })), failures, browserErrors }, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
