import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const demo = process.argv.includes("--demo");
const apiPort = process.env.DISPATCH_API_PORT || "8000";
const webPort = process.env.PORT || "3000";
const db = process.env.DISPATCH_DB || (demo ? "data/demo.sqlite3" : "data/orders.sqlite3");

const children = [
  spawn(process.env.DISPATCH_PYTHON || "python3",
    ["-B", "server.py", "--db", db, "--port", apiPort, ...(demo ? ["--demo"] : [])],
    { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [next, "dev", "frontend", "--hostname", "127.0.0.1", "--port", webPort], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DISPATCH_API_ORIGIN: `http://127.0.0.1:${apiPort}` },
  }),
];

let stopping = false;
function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
