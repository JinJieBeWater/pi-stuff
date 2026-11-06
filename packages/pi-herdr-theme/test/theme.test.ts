import { expect, onTestFinished, test } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test("文字强调色和 Herdr 画自己面板用的颜色一致", () => {
  const c = colors(mocha);
  expect(c.accent).toBe("#89b4fa");
  expect(c.mdListBullet).toBe("#89b4fa");
  expect(c.mdHeading).toBe("#eeeeef");
  expect(c.muted).toBe("#9b9ba2");
  expect(c.dim).toBe("#6d6d77");
  expect(c.mdHr).toBe("#585b70");
  expect(c.mdCodeBlock).toBe(c.text);
});

test("警告保留生成器的颜色，不跟 blocked 变成错误的红", () => {
  const c = colors(mocha);
  expect(c.warning).not.toBe(mocha.blocked);
  const [r, g] = channels(c.warning);
  expect(g!).toBeGreaterThan(r! * 0.7);
});

test("面板色在终端背景上看不清时保留生成器的颜色", () => {
  // Win98's real colors: dark ink for its grey panels, over a black terminal.
  const win98 = {
    ...mocha,
    background: "#000000",
    terminal_foreground: "#c0c0c0",
    accent: "#000080",
    solid: "#1b1b1e",
    muted: "#404040",
    dim: "#808080",
    selected: "#00000012",
  };
  const c = colors(win98);
  for (const token of [
    "mdHeading",
    "accent",
    "borderAccent",
    "mdListBullet",
    "muted",
    "toolOutput",
  ]) {
    expect(contrast(c[token], "#000000")).toBeGreaterThan(4);
  }
  expect(c.dim).toBe("#808080");
});

test("dim 本来就淡，门槛更低但也有下限", () => {
  // Herdr derives about 3.2:1 for a dark theme with terminal colors only.
  expect(colors(mocha).dim).toBe("#6d6d77");
  const latte = { ...mocha, background: "#eff1f5", terminal_foreground: "#4c4f69", dim: "#8c8fa1" };
  expect(colors(latte).dim).not.toBe("#8c8fa1");
});

test("分隔线本来就该淡，不受对比度规则影响", () => {
  expect(colors({ ...mocha, ansi8: "#2a2a3a" }).mdHr).toBe("#2a2a3a");
});

test("调色板原色只要看得清就用，看不清保留生成器的对比度", () => {
  const dark = colors(mocha);
  expect(dark.success).toBe("#a6e3a1");
  expect(dark.syntaxFunction).toBe("#f9e2af");

  const latte = colors({
    ...mocha,
    background: "#eff1f5",
    terminal_foreground: "#4c4f69",
    ansi2: "#40a02b",
    ansi3: "#df8e1d",
  });
  for (const token of ["success", "toolDiffAdded", "syntaxString", "syntaxFunction", "warning"]) {
    expect(contrast(latte[token], "#eff1f5")).toBeGreaterThan(4);
  }

  // T3 Code Light's green is dark enough for a light background.
  const t3 = { ...mocha, background: "#fcfcfc", terminal_foreground: "#2f2f32", ansi2: "#107c10" };
  expect(colors(t3).success).toBe("#107c10");
});

test("任何半透明颜色都压平，Pi 不接受 #rrggbbaa", () => {
  const c = colors({ ...mocha, muted: "#ffffff80", accent: "#ffb34780", ansi8: "#ffffff80" });
  for (const token of ["muted", "toolOutput", "accent", "mdHr"]) {
    expect(c[token]).toMatch(/^#[0-9a-f]{6}$/);
  }
  // #ffffff at 0x80/255 over #1e1e2e
  expect(c.muted).toBe("#8f8f97");
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
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "herdr-app-theme.json");
  expect(sync(generate, file, dir)).toBe(false);
  writeFileSync(file, JSON.stringify({ name: "catppuccin-mocha", colors: mocha }));
  expect(sync(generate, file, dir)).toBe(true);
  expect(readFileSync(join(dir, "themes", "herdr.json"), "utf8")).toBe(buildTheme(generate, mocha));
});

test("内容不变时不重写文件", () => {
  const agent = mkdtempSync(join(tmpdir(), "pi-agent-"));
  onTestFinished(() => rmSync(agent, { recursive: true, force: true }));
  const text = buildTheme(generate, mocha);
  expect(writeTheme(text, agent)).toBe(true);
  expect(writeTheme(text, agent)).toBe(false);
  expect(readFileSync(join(agent, "themes", "herdr.json"), "utf8")).toBe(text);
});
