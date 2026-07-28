import http from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";

export type BrowserLoginResult = {
  access_token: string;
  username: string;
};

function openBrowser(url: string): void {
  const plat = platform();
  if (plat === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (plat === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

/**
 * Start a one-shot localhost callback server, open WebUI login, wait for token.
 */
export function loginViaBrowser(webuiBase: string, timeoutMs = 5 * 60 * 1000): Promise<BrowserLoginResult> {
  const base = webuiBase.replace(/\/$/, "");

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || "/", "http://127.0.0.1");
        if (u.pathname !== "/callback") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const token = u.searchParams.get("token") || "";
        const username = u.searchParams.get("username") || "";
        if (!token) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h3>缺少 token</h3><p>请关闭此页，回到终端重试。</p></body></html>");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body style=\"font-family:system-ui;padding:40px\">" +
            "<h2>✓ nhx 登录成功</h2>" +
            `<p>用户 <b>${username || "(unknown)"}</b>。可以关闭此页，回到终端继续。</p>` +
            "</body></html>",
        );
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          server.close();
          resolve({ access_token: token, username });
        }
      } catch (e) {
        res.writeHead(500);
        res.end("error");
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          server.close();
          reject(e);
        }
      }
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error("浏览器登录超时（5 分钟）。请重试 nhx login，或使用 nhx login -u <user> -p <pass>"));
    }, timeoutMs);

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        settled = true;
        clearTimeout(timer);
        reject(new Error("无法启动本地回调服务"));
        return;
      }
      const callback = `http://127.0.0.1:${addr.port}/callback`;
      const loginUrl =
        `${base}/login?nhx_callback=${encodeURIComponent(callback)}`;
      console.log(`打开浏览器登录页: ${loginUrl}`);
      console.log("请在浏览器中登录或注册；完成后终端会自动继续…");
      try {
        openBrowser(loginUrl);
      } catch {
        console.log("（无法自动打开浏览器，请手动访问上面的 URL）");
      }
    });

    server.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function resolveWebuiBase(cliWebui?: string, apiBase?: string): string {
  if (cliWebui?.trim()) return cliWebui.trim().replace(/\/$/, "");
  const env = (process.env.NHX_WEBUI || process.env.NHX_WEBUI_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  // Derive from API host: :8000 → :5173 (local Vite default)
  try {
    if (apiBase) {
      const u = new URL(apiBase);
      if (isLocalhost(u.hostname) && (u.port === "8000" || u.port === "")) {
        u.port = "5173";
        return u.origin;
      }
    }
  } catch {
    /* ignore */
  }
  return "http://127.0.0.1:5173";
}
