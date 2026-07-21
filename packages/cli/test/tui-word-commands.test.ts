import { describe, it, expect } from "vitest";
import {
  parseCommand,
  resolveCommandName,
  COMMANDS_BY_SCREEN,
  commandsFooter,
  type TuiScreenKind
} from "../src/tui.js";

describe("hx tui word commands", () => {
  it("parseCommand maps bare digits to open <n>", () => {
    expect(parseCommand("3")).toEqual({ name: "open", arg: "3" });
    expect(parseCommand("open 2")).toEqual({ name: "open", arg: "2" });
  });

  it("parseCommand lowercases word commands", () => {
    expect(parseCommand("  Help  ")).toEqual({ name: "help" });
    expect(parseCommand("FOCUS")).toEqual({ name: "focus" });
  });

  it("rejects single-character shortcuts via resolveCommandName", () => {
    const singles = ["n", "r", "a", "c", "s", "d", "h", "q", "g", "p", "b", "k", "?"];
    for (const kind of Object.keys(COMMANDS_BY_SCREEN) as TuiScreenKind[]) {
      for (const ch of singles) {
        expect(resolveCommandName(kind, ch)).toBeUndefined();
      }
    }
  });

  it("resolves synonyms to canonical names", () => {
    expect(resolveCommandName("home", "next")).toBe("focus");
    expect(resolveCommandName("org", "suggested")).toBe("next");
    expect(resolveCommandName("change", "pack")).toBe("guide");
    expect(resolveCommandName("home", "exit")).toBe("quit");
  });

  it("each screen command table covers required verbs", () => {
    const required: Record<TuiScreenKind, string[]> = {
      home: ["focus", "req", "arch", "changes", "status", "doctor", "suggested", "gate", "guide", "help", "quit"],
      org: ["next", "gate", "guide", "status", "doctor", "prd", "back", "help", "quit"],
      change: ["next", "gate", "guide", "status", "doctor", "changes", "back", "help", "quit"],
      "change-picker": ["open", "back", "help", "quit"],
      "prd-picker": ["open", "back", "help", "quit"]
    };
    for (const [kind, names] of Object.entries(required) as [TuiScreenKind, string[]][]) {
      const have = new Set(COMMANDS_BY_SCREEN[kind].map((d) => d.name));
      for (const n of names) expect(have.has(n)).toBe(true);
      expect(commandsFooter(kind)).toContain("help");
      expect(commandsFooter(kind)).toContain("quit");
      expect(commandsFooter(kind)).not.toMatch(/\b[nrgpqbdksah]\b/);
    }
  });
});
