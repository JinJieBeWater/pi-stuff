import { getAgentDir, getPackageDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type Rgb = { r: number; g: number; b: number };
type Generate = (input: {
  foreground?: Rgb;
  background?: Rgb;
  palette?: Rgb[];
  saturation?: number;
}) => {
  colors: Record<string, string | number>;
  appearance: "dark" | "light" | undefined;
};
/** The colors Herdr App draws with now (a mod's `theme()`): the theme file's, plus what Herdr derives for the rest. */
export type HerdrColors = Record<string, string>;

export const THEME_NAME = "herdr";
// Panels stay near grey like Herdr's own cards; hue is left to text and small accents.
const PANEL_SATURATION = 0.35;
// An accent closer than this to the link blue would make inline code look like a link.
const LINK_HUE_GAP = 45;
/** Written by Herdr T3's `t3-theme-export` extra (JinJieBeWater/herdr-t3, extras/mods) whenever Herdr's colors change. */
export const HERDR_THEME_FILE = join(homedir(), ".cache", "herdr-app-theme.json");

const rgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const hue = ({ r, g, b }: Rgb) => (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
const hueGap = (a: string, b: string) => Math.abs(((hue(rgb(a)) - hue(rgb(b)) + 540) % 360) - 180);
const hex = (c: Rgb) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
// Herdr's panel colors can be translucent (#rrggbbaa); Pi needs them flattened onto the background.
const over = (color: string, background: string) => {
  if (color.length !== 9) return color;
  const alpha = parseInt(color.slice(7), 16) / 255;
  const [top, bottom] = [rgb(color), rgb(background)];
  const mix = (k: keyof Rgb) => top[k] * alpha + bottom[k] * (1 - alpha);
  return hex({ r: mix("r"), g: mix("g"), b: mix("b") });
};

// shortcut: Pi does not export its system theme generator, so this imports it by path; recheck after Pi upgrades.
export async function loadGenerator(): Promise<Generate> {
  const file = join(getPackageDir(), "dist", "modes", "interactive", "theme", "system-theme.js");
  return ((await import(pathToFileURL(file).href)) as { generateSystemThemeColors: Generate })
    .generateSystemThemeColors;
}

/** The Pi theme JSON for a theme's colors as Herdr App draws them. */
export function buildTheme(generate: Generate, herdr: HerdrColors): string {
  const background = herdr.background!;
  const ansi = (i: number) => herdr[`ansi${i}`]!;
  const input = {
    foreground: rgb(herdr.terminal_foreground ?? herdr.foreground!),
    background: rgb(background),
    palette: Array.from({ length: 16 }, (_, i) => rgb(ansi(i))),
  };
  const generated = generate({ ...input, saturation: 1 });
  const quiet = generate({ ...input, saturation: PANEL_SATURATION }).colors;
  // Text accents take the colors Herdr draws its own panels with, so Pi and Herdr agree.
  const as = (value: string, ...tokens: string[]) =>
    Object.fromEntries(tokens.map((token) => [token, value]));
  const accent = herdr.accent!;
  const colors = {
    ...generated.colors,
    // Tables and Mermaid paint with this token too, so it reads as body text, not the generator's green.
    mdCodeBlock: generated.colors.text!,
    ...as(herdr.solid!, "mdHeading"),
    ...as(accent, "accent", "borderAccent", "mdListBullet", "customMessageLabel"),
    // Like Codex, inline code falls back to the theme accent, but keeps the palette's magenta beside a blue one.
    ...(hueGap(accent, ansi(4)) >= LINK_HUE_GAP ? as(accent, "mdCode") : {}),
    ...as(herdr.muted!, "muted", "toolOutput", "mdQuote", "thinkingText"),
    ...as(herdr.dim!, "dim"),
    ...as(herdr.blocked!, "warning"),
    ...as(ansi(3), "syntaxFunction"),
    ...as(ansi(2), "success", "toolDiffAdded", "syntaxString"),
    // Fences, table rules, Mermaid boxes and rules sit back in the palette's dark grey.
    ...as(ansi(8), "mdCodeBlockBorder", "mdQuoteBorder", "mdHr"),
    selectedBg: quiet.selectedBg!,
    userMessageBg: quiet.userMessageBg!,
    customMessageBg: quiet.customMessageBg!,
    toolPendingBg: quiet.toolPendingBg!,
    // A finished tool is Herdr's selected-row grey.
    toolSuccessBg: over(herdr.selected!, background),
    toolErrorBg: quiet.toolErrorBg!,
  };
  return `${JSON.stringify({ name: THEME_NAME, appearance: generated.appearance, colors }, null, 2)}\n`;
}

/** Writes the theme only when it changed, atomically, so Pi's theme watcher never reads half a file. */
export function writeTheme(text: string, agentDir = getAgentDir()): boolean {
  const target = join(agentDir, "themes", `${THEME_NAME}.json`);
  if (existsSync(target) && readFileSync(target, "utf8") === text) return false;
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, target);
  return true;
}

/** Regenerates Pi's theme from the exported colors; false when there is no export yet. */
export function sync(generate: Generate, file = HERDR_THEME_FILE, agentDir = getAgentDir()): boolean {
  if (!existsSync(file)) return false;
  writeTheme(buildTheme(generate, readJson<{ colors: HerdrColors }>(file).colors), agentDir);
  return true;
}

export default async function herdrTheme(pi: ExtensionAPI): Promise<void> {
  const generate = await loadGenerator();
  const run = () => {
    try {
      sync(generate);
    } catch {
      // Not Herdr's export format; the next write retries.
    }
  };
  run();
  mkdirSync(dirname(HERDR_THEME_FILE), { recursive: true });
  // Herdr writes the file atomically (a rename), so its folder is watched rather than the file.
  const watcher = watch(dirname(HERDR_THEME_FILE), (_event, name) => {
    if (name === basename(HERDR_THEME_FILE)) run();
  });
  pi.on("session_shutdown", () => watcher.close());
}
