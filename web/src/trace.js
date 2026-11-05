/** Pure logic for the request trace: no DOM, no network. */

/** Maximum plausible values, used to reject a response that cannot be real. */
const MAX_MS = 60_000;

/** Airport codes used in CloudFront edge location names, mapped to the city they stand for. */
const POP_CITIES = {
  FCO: "Rome",
  MXP: "Milan",
  LIN: "Milan",
  NAP: "Naples",
  PMO: "Palermo",
  TRN: "Turin",
  VCE: "Venice",
  BLQ: "Bologna",
  FRA: "Frankfurt",
  MUC: "Munich",
  BER: "Berlin",
  HAM: "Hamburg",
  DUS: "Dusseldorf",
  CDG: "Paris",
  MRS: "Marseille",
  LHR: "London",
  MAN: "Manchester",
  DUB: "Dublin",
  AMS: "Amsterdam",
  BRU: "Brussels",
  ZRH: "Zurich",
  VIE: "Vienna",
  PRG: "Prague",
  WAW: "Warsaw",
  BUD: "Budapest",
  CPH: "Copenhagen",
  ARN: "Stockholm",
  OSL: "Oslo",
  HEL: "Helsinki",
  MAD: "Madrid",
  BCN: "Barcelona",
  LIS: "Lisbon",
  ATH: "Athens",
  SOF: "Sofia",
  IAD: "Ashburn",
  JFK: "New York",
  ORD: "Chicago",
  SFO: "San Francisco",
  LAX: "Los Angeles",
  SEA: "Seattle",
  DFW: "Dallas",
  ATL: "Atlanta",
  MIA: "Miami",
  YUL: "Montreal",
  NRT: "Tokyo",
  SIN: "Singapore",
  ICN: "Seoul",
  HKG: "Hong Kong",
  BOM: "Mumbai",
  DEL: "Delhi",
  SYD: "Sydney",
  GRU: "Sao Paulo",
};

/** City for an edge location code, or null when the code is not in the table (the raw code is shown then). */
export function popCity(code) {
  return POP_CITIES[code] ?? null;
}

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

function edgeLabel(pop) {
  const city = popCity(pop.code);
  return city ? `${pop.raw} (${city})` : `location ${pop.raw}`;
}

/** The hops of the trace, in order, each with only values that were measured or returned. */
export function hops(trace) {
  return [
    {
      id: "you",
      title: "You",
      detail: trace.country ? `country ${trace.country}` : "browser",
      why: "Your browser timed this call itself. I only report what it measured.",
    },
    {
      id: "edge",
      title: "CloudFront edge",
      detail: trace.pop ? edgeLabel(trace.pop) : "location not exposed",
      why: "One distribution serves site and API, so there is no CORS and this header is readable.",
    },
    {
      id: "lambda",
      title: `Lambda ${trace.region.replaceAll("-", "\u2011")}`,
      detail: `${trace.coldStart ? "cold" : "warm"} start, ${trace.handlerMs} ms in the handler`,
      why: "The first version took 2.2 s cold. Creating the client at start-up fixed it.",
    },
    {
      id: "db",
      title: "DynamoDB",
      detail: `visit counter +1, now ${trace.visit}`,
      why: "An atomic ADD, so two visitors at once never overwrite each other.",
    },
  ];
}

/** Lines of the downloadable receipt. A line starting with "-" is a separator. */
export function receiptLines(trace, now = new Date()) {
  const stamp = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const city = trace.pop ? popCity(trace.pop.code) : null;
  return [
    "RECEIPT OF YOUR REQUEST",
    "issued by Davide Mibelli",
    stamp,
    "--------------------------------",
    `visitor      #${trace.visit}`,
    `edge         ${trace.pop ? trace.pop.raw : "n/a"}${city ? ` (${city})` : ""}`,
    `lambda       ${trace.region} (${trace.coldStart ? "cold" : "warm"})`,
    `handler      ${trace.handlerMs} ms`,
    `round trip   ${trace.roundTripMs} ms`,
    `request id   ${trace.requestId.slice(0, 8)}...`,
    "--------------------------------",
    "Measured by your browser,",
    "returned by AWS. Not invented.",
    "The function never reads your IP.",
  ];
}

/** A command anyone can run to see the same headers without trusting this page. */
export function verifyCommand(origin) {
  return `curl -si ${origin}/api/trace | head -n 20`;
}
