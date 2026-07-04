const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { collectDaily } = require("./collector");

const rootDir = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");

async function appendLog(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "desktop.log");
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, line, "utf8");
  } catch {
    // Logging must never block the app.
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "基金投资建议助手",
    backgroundColor: "#f6f8f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.removeMenu();
  win.loadFile(path.join(rootDir, "web", "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function spawnPython(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      windowsHide: true,
      env: { ...process.env, ...env }
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function runPythonScript(scriptPath, env) {
  const candidates = [
    { command: "python", args: [scriptPath] },
    { command: "py", args: ["-3", scriptPath] },
    { command: "python3", args: [scriptPath] }
  ];
  const errors = [];
  for (const candidate of candidates) {
    try {
      await appendLog(`Trying ${candidate.command} ${candidate.args.join(" ")}`);
      return await spawnPython(candidate.command, candidate.args, env);
    } catch (error) {
      errors.push(`${candidate.command}: ${error.message}`);
      await appendLog(`${candidate.command} failed: ${error.message}`);
    }
  }
  throw new Error(`无法运行 Python 采集脚本。${errors.join(" | ")}`);
}

ipcMain.handle("daily:refresh", async () => {
  const scriptPath = path.join(rootDir, "scripts", "collect_daily.py");
  const runtimeDir = path.join(app.getPath("userData"), "runtime");
  const jsonPath = path.join(runtimeDir, "daily-news.json");
  const webOutput = path.join(runtimeDir, "live-data.js");
  await fs.mkdir(runtimeDir, { recursive: true });
  let payload;
  try {
    await appendLog("Trying built-in JS collector");
    payload = await collectDaily({ rootDir, outputDir: runtimeDir });
  } catch (jsError) {
    await appendLog(`JS collector failed: ${jsError.message}`);
    await runPythonScript(scriptPath, {
      FUND_ASSISTANT_ROOT: rootDir,
      FUND_ASSISTANT_SOURCE_FILE: path.join(rootDir, "config", "news_sources.json"),
      FUND_ASSISTANT_JSON_OUTPUT: jsonPath,
      FUND_ASSISTANT_WEB_OUTPUT: webOutput
    });
    const raw = await fs.readFile(jsonPath, "utf8");
    payload = JSON.parse(raw);
  }
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("日报 JSON 格式不正确");
  }
  await appendLog(`Daily refresh OK: ${payload.generatedAt}, items=${payload.items.length}`);
  return payload;
});

ipcMain.handle("app:root", async () => rootDir);
ipcMain.handle("app:logPath", async () => path.join(app.getPath("userData"), "desktop.log"));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
