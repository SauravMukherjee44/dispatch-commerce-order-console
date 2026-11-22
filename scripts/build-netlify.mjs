import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cp, mkdir } from "node:fs/promises";

const dir = new URL("../frontend/public/catalogue/", import.meta.url);
await mkdir(dir, { recursive: true });
await cp(new URL("../public/catalogue/", import.meta.url), dir, { recursive: true });

const command = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawnSync(process.execPath, [fileURLToPath(command), "build", "frontend"], {
  cwd: new URL("../", import.meta.url),
  stdio: "inherit",
  env: { ...process.env, DISPATCH_STATIC_EXPORT: "1" },
});
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
