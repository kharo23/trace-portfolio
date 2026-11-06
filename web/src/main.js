import "./style.css";
import { renderReceipt } from "./receipt.js";
import { buildTrace, hops, receiptLines, verifyCommand } from "./trace.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

let lastTrace = null;

async function fetchTrace() {
  const started = performance.now();
  const response = await fetch("/api/trace", { cache: "no-store" });
  const roundTripMs = performance.now() - started;
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = await response.json();
  return buildTrace(body, { pop: response.headers.get("x-amz-cf-pop"), roundTripMs });
}

function showError(message) {
  idle();
  $("route-state").textContent = "trace failed";
  $("trace-note").className = "note error";
  $("trace-note").textContent =
    `Live trace unavailable (${message}). Nothing is shown rather than a made-up trace.`;
  $("receipt").hidden = true;
  $("verify").hidden = true;
}

async function reveal(trace) {
  $("hops").innerHTML = hops(trace)
    .map(
      (h) =>
        `<li class="stop" data-id="${esc(h.id)}"><b>${esc(h.title)}</b><span>${esc(h.detail)}</span><em>${esc(h.why)}</em></li>`,
    )
    .join("");
  for (const node of document.querySelectorAll(".stop")) {
    await sleep(380);
    node.classList.add("on");
  }
  $("trace").classList.add("done");
  $("route-state").textContent = `traced · request #${trace.visit}`;
  const share = Math.min(100, Math.max(1, (trace.handlerMs / Math.max(trace.roundTripMs, 1)) * 100));
  $("meter-fill").style.width = `${share}%`;
  $("meter-text").textContent =
    `${trace.handlerMs} ms inside the function of ${trace.roundTripMs} ms round trip. The rest is network and CloudFront.`;
  $("meter").hidden = false;
  $("trace-note").className = "note";
  $("trace-note").textContent = "The order of the stops is illustrative, the values are real.";
  $("beacon").classList.add("idle-done");
  if (!reduceMotion) $("trace").scrollIntoView({ block: "nearest", behavior: "smooth" });
  $("receipt").hidden = false;
  $("verify").hidden = false;
}

const STOPS = [
  ["You", "your browser and country"],
  ["CloudFront edge", "the nearest edge location"],
  ["Lambda", "function in eu-central-1"],
  ["DynamoDB", "the request counter"],
];

function stops(klass, detail) {
  $("hops").innerHTML = STOPS.map(
    ([t, d]) => `<li class="stop ${klass}"><b>${esc(t)}</b><span>${esc(detail ?? d)}</span></li>`,
  ).join("");
}

function idle() {
  $("trace").classList.remove("done");
  $("meter").hidden = true;
  stops("idle");
}

function skeleton() {
  $("trace").classList.remove("done");
  $("meter").hidden = true;
  $("route-state").textContent = "tracing...";
  stops("pending", "waiting for AWS...");
}

async function onTrace() {
  const button = $("beacon");
  button.disabled = true;
  skeleton();
  $("trace-note").className = "note";
  $("trace-note").textContent = "Tracing...";
  $("receipt").hidden = true;
  $("verify").hidden = true;
  try {
    lastTrace = await fetchTrace();
    await reveal(lastTrace);
  } catch (error) {
    lastTrace = null;
    showError(error.message);
  } finally {
    button.disabled = false;
  }
}

async function onReceipt() {
  if (!lastTrace) return;
  const blob = await renderReceipt(receiptLines(lastTrace));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `trace-receipt-${lastTrace.visit}.png`;
  link.click();
  URL.revokeObjectURL(link.href);
}

$("verify-cmd").textContent = verifyCommand(window.location.origin);
$("copy-cmd").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("verify-cmd").textContent);
    $("copy-cmd").textContent = "Copied";
  } catch {
    $("copy-cmd").textContent = "Select and copy";
  }
});
$("beacon").addEventListener("click", onTrace);
$("receipt").addEventListener("click", onReceipt);
idle();
