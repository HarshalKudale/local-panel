import { describe, it, expect } from "vitest";
import { localPanelTheme, getHighlightExtension } from "@/lib/codemirrorTheme";

describe("codemirrorTheme", () => {
  it("localPanelTheme is a non-null Extension", () => {
    expect(localPanelTheme).toBeDefined();
    expect(localPanelTheme).not.toBeNull();
  });

  it("getHighlightExtension returns an Extension for dark mode", () => {
    const ext = getHighlightExtension(false);
    expect(ext).toBeDefined();
    expect(ext).not.toBeNull();
  });

  it("getHighlightExtension returns an Extension for light mode", () => {
    const ext = getHighlightExtension(true);
    expect(ext).toBeDefined();
    expect(ext).not.toBeNull();
  });

  it("dark and light extensions are distinct objects", () => {
    const dark  = getHighlightExtension(false);
    const light = getHighlightExtension(true);
    expect(dark).not.toBe(light);
  });
});
