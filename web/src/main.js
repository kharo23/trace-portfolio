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
  $("hops").innerHTML = "";
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
        `<li class="hop" data-id="${esc(h.id)}"><b>${esc(h.title)}</b><span>${esc(h.detail)}</span><em>${esc(h.why)}</em></li>`,
    )
    .join("");
  for (const node of document.querySelectorAll(".hop")) {
    await sleep(380);
    node.classList.add("on");
  }
  $("trace-note").className = "note";
  $("trace-note").textContent =
    `Visitor #${trace.visit}. Round trip ${trace.roundTripMs} ms measured by your browser; ` +
    `${trace.handlerMs} ms measured inside the function. Hop order is illustrative, the values are real.`;
  $("receipt").hidden = false;
  $("verify").hidden = false;
}

function skeleton() {
  const titles = ["You", "CloudFront edge", "Lambda", "DynamoDB"];
  $("hops").innerHTML = titles
    .map((t) => `<li class="hop pending"><b>${esc(t)}</b><span>waiting for AWS...</span></li>`)
    .join("");
}

async function onTrace() {
  const button = $("beacon");
  button.disabled = true;
  $("trace").hidden = false;
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
$("close-trace").addEventListener("click", () => {
  $("trace").hidden = true;
  $("beacon").focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("trace").hidden) $("close-trace").click();
});
