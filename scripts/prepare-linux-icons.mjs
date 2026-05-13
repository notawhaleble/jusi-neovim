import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "jusi-neovim-logo.png");
const targetDir = join(root, "build", "icons");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

rmSync(targetDir, { recursive: true, force: true });

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

function resizeIcon(size, target) {
  if (run("sips", ["-z", String(size), String(size), source, "--out", target])) {
    return;
  }
  if (run("magick", [source, "-resize", `${size}x${size}`, target])) {
    return;
  }
  if (run("convert", [source, "-resize", `${size}x${size}`, target])) {
    return;
  }
  if (run("ffmpeg", ["-y", "-i", source, "-vf", `scale=${size}:${size}`, target])) {
    return;
  }
  if (size === 1024) {
    copyFileSync(source, target);
    return;
  }
  throw new Error("Unable to resize Linux icons. Install ImageMagick or run the build on macOS with sips available.");
}

for (const size of sizes) {
  mkdirSync(targetDir, { recursive: true });
  resizeIcon(size, join(targetDir, `${size}x${size}.png`));
}
