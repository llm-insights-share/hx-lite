import { describe, it, expect } from "vitest";
import { parseCommand, commandsFooter } from "../src/tui.js";
import { buildRootMenu, countActions, isSubmenu, resolveMenuPath } from "../src/tuiMenus.js";
import { normalizeCommandToken } from "../src/tuiLocale.js";

describe("hx tui full menu", () => {
  it("parseCommand maps bare digits to open <n>", () => {
    expect(parseCommand("3")).toEqual({ name: "open", arg: "3" });
    expect(parseCommand("open 2")).toEqual({ name: "open", arg: "2" });
  });

  it("parseCommand maps Chinese menu alias", () => {
    expect(normalizeCommandToken("zh", "菜单")).toBe("menu");
    expect(parseCommand("菜单", "zh")).toEqual({ name: "menu" });
  });

  it("root menu includes major CLI namespaces", () => {
    const root = buildRootMenu();
    const ids = root.children.map((c) => c.id);
    for (const id of [
      "workspace",
      "quick",
      "project",
      "change",
      "gate",
      "guide",
      "hub",
      "hxhub",
      "sdlc",
      "adapter",
      "mcp"
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("menu paths resolve nested submenus", () => {
    const gate = resolveMenuPath(["gate"]);
    expect(isSubmenu(gate)).toBe(true);
    expect(gate.children.length).toBeGreaterThan(3);
  });

  it("menu tree has substantial action coverage", () => {
    const total = countActions(buildRootMenu());
    expect(total).toBeGreaterThan(60);
  });

  it("commandsFooter returns context hint", () => {
    expect(commandsFooter("home", "zh")).toContain("menu");
  });
});
