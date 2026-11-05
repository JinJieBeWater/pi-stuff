import { expect, test } from "vite-plus/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTheme, loadGenerator, sync, writeTheme } from "../index";

const generate = await loadGenerator();

// What Herdr App's themes() returned for catppuccin-mocha, a theme file with terminal colors only.
const mocha = {
  background: "#1e1e2e",
  foreground: "#eeeeef",
  terminal_foreground: "#cdd6f4",
  accent: "#89b4fa",
  solid: "#eeeeef",
  muted: "#9b9ba2",
  dim: "#6d6d77",
  selected: "#ffffff17",
  blocked: "#f38ba8",
  ...Object.fromEntries(
    [
      "#45475a",
      "#f38ba8",
      "#a6e3a1",
      "#f9e2af",
      "#89b4fa",
      "#f5c2e7",
      "#94e2d5",
      "#bac2de",
      "#585b70",
      "#f7aec2",
      "#c2ecbf",
      "#fcd682",
      "#aeccfc",
      "#f398da",
      "#b1eae1",
      "#a6adc8",
    ].map((color, i) => [`ansi${i}`, color]),
  ),
};
const colors = (herdr: Record<string, string>) => JSON.parse(buildTheme(generate, herdr)).colors;
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test("文字强调色和 Herdr 画自己面板用的颜色一致", () => {
  const c = colors(mocha);
  expect(c.accent).toBe("#89b4fa");
  expect(c.mdListBullet).toBe("#89b4fa");
  expect(c.mdHeading).toBe("#eeeeef");
  expect(c.muted).toBe("#9b9ba2");
  expect(c.dim).toBe("#6d6d77");
  expect(c.warning).toBe("#f38ba8");
  expect(c.mdHr).toBe("#585b70");
  expect(c.mdCodeBlock).toBe(c.text);
});

test("半透明的选中色压到背景上，作为成功卡片的底色", () => {
  // #ffffff at 0x17/255 over #1e1e2e
  expect(colors(mocha).toolSuccessBg).toBe("#323241");
  expect(colors({ ...mocha, selected: "#2c2c2f" }).toolSuccessBg).toBe("#2c2c2f");
});

test("其余面板接近灰，失败仍偏红", () => {
  const c = colors(mocha);
  for (const token of ["toolPendingBg", "userMessageBg", "toolErrorBg"]) {
    const [r, g, b] = channels(c[token]);
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(28);
  }
  const [r, g] = channels(c.toolErrorBg);
  expect(r!).toBeGreaterThan(g! + 8);
});

test("行内代码用 accent，accent 接近链接蓝时保留调色板洋红", () => {
  expect(colors({ ...mocha, accent: "#ffb347" }).mdCode).toBe("#ffb347");
  const c = colors(mocha);
  expect(c.mdCode).toBe(c.syntaxType);
});

test("读 Herdr 导出的颜色生成主题，没有导出时不动", () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-theme-"));
  const file = join(dir, "herdr-app-theme.json");
  expect(sync(generate, file, dir)).toBe(false);
  writeFileSync(file, JSON.stringify({ name: "catppuccin-mocha", light: false, colors: mocha }));
  expect(sync(generate, file, dir)).toBe(true);
  expect(readFileSync(join(dir, "themes", "herdr.json"), "utf8")).toBe(buildTheme(generate, mocha));
});

test("内容不变时不重写文件", () => {
  const agent = mkdtempSync(join(tmpdir(), "pi-agent-"));
  const text = buildTheme(generate, mocha);
  expect(writeTheme(text, agent)).toBe(true);
  expect(writeTheme(text, agent)).toBe(false);
  expect(readFileSync(join(agent, "themes", "herdr.json"), "utf8")).toBe(text);
});
