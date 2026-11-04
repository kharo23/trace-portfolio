/** Pure logic for the request trace: no DOM, no network. */

/** Maximum plausible values, used to reject a response that cannot be real. */
const MAX_MS = 60_000;

/**
 * Parse an `x-amz-cf-pop` header such as "FRA56-P2" into the edge location code and its city hint.
 * @returns {{raw: string, code: string} | null}
 */
export function parsePop(header) {
  if (typeof header !== "string") return null;
  const match = /^([A-Z]{3})(\d{0,3})(?:-[A-Z0-9]+)?$/.exec(header.trim());
  return match ? { raw: header.trim(), code: match[1] } : null;
}

/** Validate the JSON returned by the trace API. Throws if a field is missing or implausible. */
export function validateTrace(body) {
  const fail = (field) => {
    throw new Error(`invalid trace: ${field}`);
  };
  if (!body || typeof body !== "object") fail("body");
  if (typeof body.requestId !== "string" || body.requestId.length < 8) fail("requestId");
  if (typeof body.region !== "string" || !body.region) fail("region");
  if (typeof body.coldStart !== "boolean") fail("coldStart");
  if (!Number.isFinite(body.handlerMs) || body.handlerMs < 0 || body.handlerMs > MAX_MS) fail("handlerMs");
  if (!Number.isInteger(body.visit) || body.visit < 1) fail("visit");
  return body;
}

/**
 * Combine the API body with what the browser measured.
 * `roundTripMs` is measured in the browser, `handlerMs` inside the function: they are different quantities.
 */
export function buildTrace(body, { pop, roundTripMs }) {
  validateTrace(body);
  if (!Number.isFinite(roundTripMs) || roundTripMs < 0 || roundTripMs > MAX_MS)
    throw new Error("invalid roundTripMs");
  return {
    requestId: body.requestId,
    region: body.region,
    coldStart: body.coldStart,
    handlerMs: body.handlerMs,
    roundTripMs: Math.round(roundTripMs),
    visit: body.visit,
    country: body.viewerCountry ?? null,
    pop: parsePop(pop),
  };
}

/** The hops of the trace, in order, each with only values that were measured or returned. */
export function hops(trace) {
  return [
    { id: "you", title: "You", detail: trace.country ? `country ${trace.country}` : "browser" },
    {
      id: "edge",
      title: "CloudFront edge",
      detail: trace.pop ? `location ${trace.pop.raw}` : "location not exposed",
    },
    {
      id: "lambda",
      title: `Lambda ${trace.region}`,
      detail: `${trace.coldStart ? "cold" : "warm"} start, ${trace.handlerMs} ms in the handler`,
    },
    { id: "db", title: "DynamoDB", detail: `visit counter +1, now ${trace.visit}` },
  ];
}

/** Lines of the downloadable receipt. */
export function receiptLines(trace, now = new Date()) {
  const stamp = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return [
    "TRACE RECEIPT",
    "davidemibelli / AWS Student Builder Challenge",
    stamp,
    "--------------------------------",
    `visitor      #${trace.visit}`,
    `edge         ${trace.pop ? trace.pop.raw : "n/a"}`,
    `lambda       ${trace.region} (${trace.coldStart ? "cold" : "warm"})`,
    `handler      ${trace.handlerMs} ms`,
    `round trip   ${trace.roundTripMs} ms`,
    `request id   ${trace.requestId.slice(0, 8)}...`,
    "--------------------------------",
    "Measured by the page, returned by AWS.",
    "Stored: one counter. Nothing else.",
  ];
}
