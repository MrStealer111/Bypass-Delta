import http from "http";
import { solveDelta, sessionKey } from "./solve.mjs";

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:2233");
  const send = (obj, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (u.pathname === "/health") return send({ ok: true });
  if (u.pathname === "/delta") {
    const rawUrl = u.searchParams.get("url") || "";
    const ticket = rawUrl.includes("d=") ? rawUrl.split("d=")[1].split(/[?#&]/)[0] : rawUrl;
    if (!ticket) return send({ error: "missing url" }, 400);
    const logs = [];
    const onLog = (m) => { logs.push(m); if (process.env.DEBUG) console.log("[delta]", m); };
    try {
      const k = await sessionKey(ticket);
      if (k) return send({ success: true, key: k, source: "status", logs });
      const r = await solveDelta(ticket, onLog);
      if (r && r.key) return send({ success: true, key: r.key, source: r.source || "solve", logs });
      return send({ success: false, error: (r && r.error) || "bypass failed", logs });
    } catch (e) {
      return send({ success: false, error: String((e && e.message) || e), logs });
    }
  }
  return send({ error: "not found" }, 404);
});
server.listen(2233, "127.0.0.1", () => console.log("delta-2233 listening on 2233 (GET /delta, browser solver)"));