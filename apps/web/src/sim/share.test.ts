import { VARIANTS } from "@insonate/sono-engine";
import { describe, expect, it } from "vitest";
import { useSono } from "../state/store";
import { decodeMystery, encodeMystery, mysteryLink, parseShare, shareLink } from "./share";

describe("shared links", () => {
  it("round-trips the patient, mode, task, probe pose, breath and Doppler", () => {
    useSono.setState({
      patient: "s0319",
      mode: "tasks",
      taskId: "kidney-right-long",
      pose: { phiDeg: 70, zMm: 42, rotationDeg: -10, tiltDeg: 10, rockDeg: 6 },
      breathing: "inspire",
      settings: { ...useSono.getState().settings, doppler: "color" },
      variant: "normal",
      quiz: null,
    });
    const link = shareLink(useSono.getState(), "https://example.org/insonate/");
    expect(link.startsWith("https://example.org/insonate/#")).toBe(true);
    const shared = parseShare(link.slice(link.indexOf("#")));
    expect(shared).toEqual({
      patient: "s0319",
      mode: "tasks",
      task: "kidney-right-long",
      pose: { phiDeg: 70, zMm: 42, rotationDeg: -10, tiltDeg: 10, rockDeg: 6 },
      breathing: "inspire",
      doppler: "color",
    });
  });

  it("hides the diagnosis of a mystery patient, but decodes it", () => {
    for (const variant of VARIANTS) {
      const code = encodeMystery(variant);
      expect(code).not.toContain(variant);
      expect(decodeMystery(code)).toBe(variant);
    }
    const link = mysteryLink("aaa", "https://example.org/");
    expect(link).not.toContain("aaa");
    expect(parseShare(link.slice(link.indexOf("#"))).mystery).toBe("aaa");
  });

  it("ignores what it does not understand", () => {
    expect(parseShare("#mode=nope&task=liver-transplant&case=unicorn&view=1,2,3&breath=hold&mystery=zzzz")).toEqual({});
  });
});
