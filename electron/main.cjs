const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

app.setName("听译台");

const port = 43117;
let backend = null;
let mainWindow = null;
let quitting = false;

function readEnvironment(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function startBackend() {
  const appRoot = app.getAppPath();
  const supportDir = app.getPath("userData");
  const resourceRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const configured = readEnvironment(path.join(supportDir, ".env"));
  const env = {
    ...process.env,
    ...configured,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(port),
    HOST: "127.0.0.1",
    BAYT_DATA_DIR: path.join(supportDir, "data"),
    BAYT_PYTHON: path.join(supportDir, ".venv/bin/python"),
    BAYT_TRANSCRIBE_SCRIPT: path.join(resourceRoot, "scripts/transcribe.py"),
    PATH: ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH].filter(Boolean).join(":")
  };
  backend = spawn(process.execPath, [path.join(appRoot, "server.js")], {
    cwd: supportDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  backend.stdout.on("data", (chunk) => process.stdout.write(chunk));
  backend.stderr.on("data", (chunk) => process.stderr.write(chunk));
  backend.on("exit", (code) => {
    backend = null;
    if (!quitting && code) dialog.showErrorBox("听译台服务已停止", `本机服务退出，错误码：${code}`);
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error("本机服务启动超时。");
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "听译台", submenu: [
      { role: "about", label: "关于听译台" },
      { type: "separator" },
      { role: "hide", label: "隐藏听译台" },
      { role: "hideOthers", label: "隐藏其他" },
      { role: "unhide", label: "全部显示" },
      { type: "separator" },
      { role: "quit", label: "退出听译台" }
    ] },
    { label: "编辑", submenu: [
      { role: "undo", label: "撤销" }, { role: "redo", label: "重做" },
      { type: "separator" },
      { role: "cut", label: "剪切" }, { role: "copy", label: "复制" }, { role: "paste", label: "粘贴" },
      { role: "selectAll", label: "全选" }
    ] },
    { label: "显示", submenu: [
      { role: "reload", label: "重新载入" },
      { role: "togglefullscreen", label: "进入全屏" }
    ] },
    { label: "窗口", submenu: [
      { role: "minimize", label: "最小化" },
      { role: "zoom", label: "缩放" },
      { role: "front", label: "前置全部窗口" }
    ] }
  ]));
}

async function createWindow() {
  startBackend();
  await waitForBackend();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    title: "听译台",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: "#edf2f2",
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) event.preventDefault();
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    installMenu();
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox("听译台无法启动", error.message);
      app.quit();
    }
  });
}

app.on("before-quit", () => {
  quitting = true;
  backend?.kill("SIGTERM");
});

app.on("window-all-closed", () => app.quit());
