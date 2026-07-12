/**
 * Build a static HTML5 package for itch.io and zip it.
 *
 * Upload `dist/spear-of-destiny-web.zip` as Kind of project: HTML.
 * Set Mobile Friendly; prefer Click to launch in fullscreen.
 */
const OUT_DIR = "dist/itch";
const ZIP_PATH = "dist/spear-of-destiny-web.zip";

async function main(): Promise<void> {
  await run(Deno.execPath(), [
    "run",
    "-A",
    "npm:vite",
    "build",
    "--config",
    "vite.itch.config.ts",
  ]);

  await Deno.remove(ZIP_PATH).catch(() => {});
  await run("zip", ["-r", "-X", "../spear-of-destiny-web.zip", ".", "-x", "*.DS_Store"], OUT_DIR);

  const zipInfo = await Deno.stat(ZIP_PATH);
  const fileCount = await countFiles(OUT_DIR);
  console.log(`itch package ready: ${ZIP_PATH} (${formatBytes(zipInfo.size)}, ${fileCount} files)`);
  console.log(`preview: deno task preview:itch`);
}

async function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  const result = await new Deno.Command(cmd, {
    args,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) {
    Deno.exit(result.code === 0 ? 1 : result.code);
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) count += await countFiles(path);
    else if (entry.isFile) count += 1;
  }
  return count;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}
