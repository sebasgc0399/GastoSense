import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MAX_READ_BYTES = 80 * 1024;
const MAX_LIST_ITEMS = 200;
const DEFAULT_LIST_LIMIT = 50;
const RUN_TIMEOUT_MS = 120_000;

type RunResult = { exitCode: number; stdout: string; stderr: string };

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function binPath(dir: string, binName: string) {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return path.join(dir, "node_modules", ".bin", `${binName}${suffix}`);
}

function findRepoRoot(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    const frontendPkg = path.join(current, "frontend", "package.json");
    const functionsPkg = path.join(current, "functions", "package.json");
    if (existsSync(frontendPkg) && existsSync(functionsPkg)) return current;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    "Repo root no encontrado. Se esperaba frontend/package.json y functions/package.json."
  );
}

function resolveRepoPath(repoRoot: string, inputPath: string) {
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(repoRoot, inputPath);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path fuera del repo.");
  }
  return resolved;
}

function truncate(text: string, maxBytes: number) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return Buffer.from(buf.subarray(0, maxBytes)).toString("utf8") + "\n...[truncated]\n";
}

async function runCommand(opts: {
  cwd: string;
  cmd: string;
  args: string[];
  timeoutMs: number;
}): Promise<RunResult> {
  const { cwd, cmd, args, timeoutMs } = opts;

  return await new Promise<RunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(cmd, args, { cwd, shell: false });

    const timer = setTimeout(() => {
      stderr += `\n[timeout] killed after ${timeoutMs}ms\n`;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    };

    child.on("error", (err) => {
      stderr += `${err instanceof Error ? err.message : String(err)}\n`;
      finish(1);
    });

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => finish(code ?? 1));
  });
}

async function main() {
  const repoRoot = findRepoRoot(process.cwd());
  const frontendDir = path.join(repoRoot, "frontend");
  const functionsDir = path.join(repoRoot, "functions");

  const tasks = {
    "frontend:test": { cwd: frontendDir, cmd: npmCmd(), args: ["run", "test"] },
    "frontend:lint": { cwd: frontendDir, cmd: npmCmd(), args: ["run", "lint"] },
    "frontend:typecheck": {
      cwd: frontendDir,
      cmd: binPath(frontendDir, "tsc"),
      args: ["-b", "--noEmit"],
    },
    "frontend:build": { cwd: frontendDir, cmd: npmCmd(), args: ["run", "build"] },
    "functions:test": { cwd: functionsDir, cmd: npmCmd(), args: ["run", "test"] },
    "functions:lint": { cwd: functionsDir, cmd: npmCmd(), args: ["run", "lint"] },
    "functions:typecheck": {
      cwd: functionsDir,
      cmd: binPath(functionsDir, "tsc"),
      args: ["--noEmit"],
    },
  } as const;

  const taskKeys = Object.keys(tasks) as Array<keyof typeof tasks>;

  const server = new McpServer({ name: "gastosense-dev", version: "0.2.0" });

  server.registerTool(
    "gs_run",
    {
      title: "Run allowlisted commands",
      description:
        "Ejecuta comandos allowlisted (sin comandos arbitrarios) contra el repo local.",
      inputSchema: {
        task: z.enum(taskKeys),
      },
    },
    async ({ task }) => {
      const spec = tasks[task];
      const result = await runCommand({
        cwd: spec.cwd,
        cmd: spec.cmd,
        args: spec.args,
        timeoutMs: RUN_TIMEOUT_MS,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                task,
                exitCode: result.exitCode,
                stdout: truncate(result.stdout, MAX_READ_BYTES),
                stderr: truncate(result.stderr, MAX_READ_BYTES),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "gs_read_file",
    {
      title: "Read file",
      description: "Lee un archivo del repo (max 80KB).",
      inputSchema: {
        path: z.string().min(1),
      },
    },
    async ({ path: inputPath }) => {
      const resolved = resolveRepoPath(repoRoot, inputPath);
      const info = await stat(resolved);
      if (!info.isFile()) {
        throw new Error("El path no es un archivo.");
      }
      if (info.size > MAX_READ_BYTES) {
        throw new Error("Archivo excede el limite de 80KB.");
      }
      const content = await readFile(resolved, "utf8");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { path: resolved, sizeBytes: info.size, content },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "gs_list_dir",
    {
      title: "List directory",
      description: "Lista una carpeta del repo con limite de items.",
      inputSchema: {
        path: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_LIST_ITEMS).optional(),
      },
    },
    async ({ path: inputPath, limit }) => {
      const resolved = resolveRepoPath(repoRoot, inputPath ?? ".");
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        throw new Error("El path no es una carpeta.");
      }
      const items = await readdir(resolved, { withFileTypes: true });
      const maxItems = Math.min(limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_ITEMS);
      const entries = items
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, maxItems)
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "dir" : "file",
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: resolved,
                count: entries.length,
                limit: maxItems,
                entries,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[gastosense-dev] fatal:", err);
  process.exit(1);
});
