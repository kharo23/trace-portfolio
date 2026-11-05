import { describe, expect, it } from "vitest";
import {
  buildTrace,
  hops,
  parsePop,
  popCity,
  receiptLines,
  validateTrace,
  verifyCommand,
} from "../src/trace.js";

const body = {
  requestId: "2f0c8a1e-0000-4000-8000-123456789abc",
  region: "eu-central-1",
  coldStart: false,
  handlerMs: 3.4,
  viewerCountry: "IT",
  visit: 12,
};

describe("parsePop", () => {
  it("parses edge location headers", () => {
    expect(parsePop("FRA56-P2")).toEqual({ raw: "FRA56-P2", code: "FRA" });
    expect(parsePop("MXP64-C1")).toEqual({ raw: "MXP64-C1", code: "MXP" });
  });
  it("rejects anything else", () => {
    expect(parsePop("")).toBeNull();
    expect(parsePop(null)).toBeNull();
    expect(parsePop("<script>")).toBeNull();
  });
});

describe("validateTrace", () => {
  it("accepts a real-looking body", () => {
    expect(validateTrace(body)).toBe(body);
  });
  it.each([
    ["requestId", { ...body, requestId: "x" }],
    ["region", { ...body, region: "" }],
    ["coldStart", { ...body, coldStart: "no" }],
    ["handlerMs", { ...body, handlerMs: -1 }],
    ["visit", { ...body, visit: 0 }],
  ])("rejects a bad %s", (_field, bad) => {
    expect(() => validateTrace(bad)).toThrow();
  });
});

describe("buildTrace", () => {
  it("combines API data with browser measurements", () => {
    const t = buildTrace(body, { pop: "FRA56-P2", roundTripMs: 71.4 });
    expect(t.roundTripMs).toBe(71);
    expect(t.pop.code).toBe("FRA");
    expect(t.country).toBe("IT");
  });
  it("keeps going when the edge location is not exposed", () => {
    const t = buildTrace(body, { pop: null, roundTripMs: 80 });
    expect(t.pop).toBeNull();
    expect(hops(t)[1].detail).toBe("location not exposed");
  });
  it("refuses an implausible round trip", () => {
    expect(() => buildTrace(body, { pop: null, roundTripMs: NaN })).toThrow();
    expect(() => buildTrace(body, { pop: null, roundTripMs: 999999 })).toThrow();
  });
});

describe("hops and receipt", () => {
  const t = buildTrace(body, { pop: "FRA56-P2", roundTripMs: 71 });
  it("lists four hops in order", () => {
    expect(hops(t).map((h) => h.id)).toEqual(["you", "edge", "lambda", "db"]);
    expect(hops(t)[2].detail).toContain("warm start");
  });
  it("never prints the full request id", () => {
    const text = receiptLines(t, new Date("2026-11-05T10:00:00Z")).join("\n");
    expect(text).toContain("visitor      #12");
    expect(text).toContain("2026-11-05 10:00 UTC");
    expect(text).not.toContain(body.requestId);
  });
});

describe("edge city", () => {
  it("maps known airport codes to a city and falls back to the raw code", () => {
    expect(popCity("FCO")).toBe("Rome");
    expect(popCity("MXP")).toBe("Milan");
    expect(popCity("ZZZ")).toBeNull();
  });
  it("shows the city next to the edge location only when it is known", () => {
    const known = buildTrace(body, { pop: "FCO50-P1", roundTripMs: 60 });
    expect(hops(known)[1].detail).toBe("FCO50-P1 (Rome)");
    const unknown = buildTrace(body, { pop: "ZZZ1-P1", roundTripMs: 60 });
    expect(hops(unknown)[1].detail).toBe("location ZZZ1-P1");
  });
});

describe("explanations and verification", () => {
  const t = buildTrace(body, { pop: "FRA56-P2", roundTripMs: 71 });
  it("gives every hop a reason that is written text, not a measurement", () => {
    for (const h of hops(t)) expect(h.why.length).toBeGreaterThan(20);
  });
  it("keeps the region on one line", () => {
    expect(hops(t)[2].title).not.toContain("-");
  });
  it("builds a command the visitor can run against the same origin", () => {
    expect(verifyCommand("https://example.test")).toBe(
      "curl -si https://example.test/api/trace | head -n 20",
    );
  });
  it("marks separators in the receipt so the renderer can draw them", () => {
    expect(receiptLines(t).filter((l) => /^-+$/.test(l))).toHaveLength(2);
  });
});
