import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const flagLines = [
  "LOCAL_STORAGE_DISABLED=true",
  "NEXT_PUBLIC_LOCAL_STORAGE_DISABLED=true",
];
const envPath = path.resolve(process.cwd(), "apps", "web", ".env");

if (mode !== "--enable" && mode !== "--disable") {
  console.error("Usage: node scripts/infra-toggle.mjs --enable|--disable");
  process.exit(1);
}

let envContents = "";
if (fs.existsSync(envPath)) {
  envContents = fs.readFileSync(envPath, "utf8");
}

const lines = envContents
  .split(/\r?\n/)
  .filter(
    (line) =>
      line.length > 0 &&
      !line.startsWith("LOCAL_STORAGE_DISABLED=") &&
      !line.startsWith("NEXT_PUBLIC_LOCAL_STORAGE_DISABLED="),
  );

if (mode === "--enable") {
  lines.push(...flagLines);
}

const nextContents = lines.length > 0 ? `${lines.join("\n")}\n` : "";
fs.writeFileSync(envPath, nextContents, "utf8");
