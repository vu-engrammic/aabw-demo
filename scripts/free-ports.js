#!/usr/bin/env node
const { execSync } = require("node:child_process");
const PORTS = (process.env.PORTS || "8790,8792,5173").split(",").map((p) => Number(p.trim())).filter(Boolean);
const isWin = process.platform === "win32";

function pids(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const set = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid > 0) set.add(pid);
      }
      return [...set];
    }
    return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" })
      .split(/\s+/)
      .map(Number)
      .filter(Boolean);
  } catch {
    return [];
  }
}

for (const port of PORTS) {
  const list = pids(port);
  if (!list.length) {
    console.log(`Port ${port}: free`);
    continue;
  }
  for (const pid of list) {
    try {
      if (isWin) execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
      else execSync(`kill -9 ${pid}`, { stdio: "inherit" });
      console.log(`Port ${port}: killed ${pid}`);
    } catch (e) {
      console.error(`Port ${port}: failed ${pid}`, e.message);
    }
  }
}
