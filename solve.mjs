import puppeteer from "puppeteer";
import { bypassLootLabsFromHtml } from "/opt/bypass-delta/lib/lootlink.js";

const MAX_ROUNDS = 4;
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800", "--disable-popup-blocking"];
const VIEWPORT = { width: 1280, height: 800 };

const LOOT_MARK = /lootlabs|loot\.link|work\.ink|boost\.ink|linkvertise|admaven/i;

export async function sessionKey(ticket) {
  try {
    const r = await fetch(`https://auth.platorelay.com/api/session/status?ticket=${ticket}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const d = await r.json();
    const key = d?.data?.key;
    return key && key !== "KEY_NOT_FOUND" ? key : null;
  } catch (e) {
    return null;
  }
}

async function getUiLen(page, log) {
  try {
    return await page.evaluate(() => (document.body ? document.body.innerText : "").length);
  } catch (e) {
    log("EVA_ERR", String(e).slice(0, 100));
    return 0;
  }
}

async function openTicketPage(browser, ticket, log) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  try {
    await page.goto(`https://auth.platorelay.com/a?d=${ticket}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  } catch (e) {
    log("goto err", String(e).slice(0, 120));
  }
  page.on("request", (r) => {
    const u = r.url();
    if (/platorelay\.com\/api\//.test(u)) {
      let body = "";
      try { body = r.postData() || ""; } catch (e) {}
      log("SPA_API", r.method(), u.replace("https://auth.platorelay.com", "").slice(0, 130), body ? " " + body.slice(0, 700) : "");
    }
  });
  page.on("response", (r) => {
    const u = r.url();
    if (/platorelay\.com\/api\//.test(u)) {
      r.text().then((t) => log("SPA_RESP", r.status(), u.replace("https://auth.platorelay.com", "").slice(0, 100), " ", t.slice(0, 900))).catch(() => {});
    }
  });
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const len = await getUiLen(page, log);
    if (len > 10) return page;
  }
  return page;
}

async function clickContinueAndGetLoot(page, log) {
  const onReq = (r) => {
    const u = r.url();
    if (LOOT_MARK.test(u)) { cleanup(); resolve(u); }
  };
  const onPopup = (p) => {
    const u = p.url();
    cleanup();
    if (u && u.startsWith("http")) resolve(u);
    else p.waitForNavigation({ timeout: 30000 }).then(() => resolve(p.url())).catch(() => resolve(null));
  };
  let resolve, cleanup;
  const lootUrl = await new Promise((res) => {
    resolve = res;
    page.on("request", onReq);
    page.on("popup", onPopup);
    cleanup = () => { page.off("request", onReq); page.off("popup", onPopup); };
    (async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const clicked = await page.evaluate(() => {
          const cands = [...document.querySelectorAll("button,a")]
            .filter(e => !e.disabled && /continue|claim|start|bypass/i.test(e.innerText || ""));
          const best = cands[cands.length - 1];
          if (best) { best.click(); return true; }
          return false;
        }).catch(() => false);
        if (clicked) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      cleanup(); res(null);
    })();
    setTimeout(() => { cleanup(); res(null); }, 35000);
  });
  if (lootUrl) log("LOOT_URL", lootUrl.slice(0, 140));
  return lootUrl;
}

async function grabLootDom(browser, lootUrl, log) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  try {
    await page.goto(lootUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    let html = "";
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      html = await page.evaluate(() => document.documentElement.outerHTML || "").catch(() => "");
      if (/document\.session\s*=/.test(html) || /CDN_DOMAIN/.test(html)) break;
    }
    return html;
  } catch (e) {
    log("grabLootDom err", String(e).slice(0, 160));
    return "";
  } finally {
    await page.close().catch(() => {});
  }
}

async function runLootLiveThenWs(browser, lootUrl, html, log) {
  log("LOOT_LIVE_TRY");
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  try {
    const onApiReq = (r) => {
      const u = r.url();
      if (/unlockr|curyrent|nerventualken|onsultingco|ptr\?/.test(u) && !/\.(js|css|png|jpg|svg|woff)/.test(u)) {
        let body = "";
        try { body = r.postData() || ""; } catch (e) {}
        log("LOOT_API_REQ", r.method(), u.slice(0, 150), body ? " " + body.slice(0, 500) : "");
      }
    };
    const onApiRes = (r) => {
      const u = r.url();
      if (/unlockr|curyrent|nerventualken|onsultingco|ptr\?/.test(u) && !/\.(js|css|png|jpg|svg|woff)/.test(u)) {
        r.text().then((t) => log("LOOT_API_RESP", r.status(), u.slice(0, 120), " ", t.slice(0, 600))).catch(() => {});
      }
    };
    page.on("request", onApiReq);
    page.on("response", onApiRes);
    await page.goto(lootUrl.replace(/&amp;/g, "&"), { waitUntil: "domcontentloaded", timeout: 60000 });
    const deadline = Date.now() + 240000;
    const tLoopStart = Date.now();
    let last = "";
    let lastClickAt = 0;
    let clicks = 0;
    const popups = [];
    const onPopup = (p) => { popups.push(p); log("LOOT_POPUP", p.url ? p.url().slice(0, 120) : "?"); };
    page.on("popup", onPopup);
    page.on("framenavigated", (f) => {
      const u = f.url() || "";
      if (/loottabs|lootlabs|loot\.link|work\.ink|boost\.ink/.test(u) === false && /^https?:/.test(u)) log("LOOT_FRAME_NAV", u.slice(0, 130));
    });
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const u = page.url();
      if (u !== last) { log("LOOT_URL_CHANGE", u.slice(0, 130)); last = u; }
      if (u.startsWith("http") && !/lootlabs|loot\.link|work\.ink|boost\.ink/.test(u)) {
        log("LOOT_REDIRECTED", u.slice(0, 140));
        return u;
      }
      for (const p of popups) {
        const u2 = (p.url && p.url()) || "";
        if (u2 && /^https?:/.test(u2) && !/lootlabs|loot\.link|work\.ink|boost\.ink/.test(u2)) {
          log("LOOT_POPUP_EXTERNAL", u2.slice(0, 140));
          return u2;
        }
      }
      const due = Date.now() - lastClickAt > 25000;
      const box = await page.evaluate(() => {
        const rx = /continue|start|claim|begin|verify|skip|enter|watch|get ?now|complete/i;
        const scan = (root) => {
          const nodes = root.querySelectorAll("button,a,[role=button],input[type=submit],.btn,.button,[onclick]");
          for (const el of nodes) {
            const t = (el.innerText || el.value || "").trim();
            if (t && t.length < 40 && rx.test(t)) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { hit: true, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
            }
          }
          return { hit: false };
        };
        let h = scan(document);
        if (!h.hit) {
          for (const f of document.querySelectorAll("iframe")) {
            try { const d = f.contentDocument; if (d) h = scan(d); if (h.hit) break; } catch (e) {}
          }
        }
        return h;
      }).catch(() => ({ hit: false }));
      if (due && box.hit) {
        lastClickAt = Date.now();
        clicks++;
        log("LOOT_TRUSTED_CLICK", JSON.stringify({ clicks, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w) }));
        try { await page.mouse.click(box.x, box.y); } catch (e) { log("LOOT_MOUSE_ERR", String(e).slice(0, 80)); }
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (clicks === 0 && Date.now() - tLoopStart > 20000) {
        const snap = await page.evaluate(() => {
          const grab = (root) => {
            const seen = new Set();
            const out = [];
            for (const el of root.querySelectorAll("h1,h2,h3,p,div,span,button,a,iframe")) {
              if (seen.has(el)) continue; seen.add(el);
              const t = (el.innerText || "").trim();
              if (t && t.length < 60 && t.length > 3) out.push(t);
            }
            return out.slice(0, 25);
          };
          let r = grab(document);
          for (const f of document.querySelectorAll("iframe")) {
            try { const d = f.contentDocument; if (d) r = r.concat(grab(d)); } catch (e) {}
          }
          return r;
        }).catch(() => []);
        log("LOOT_TEXT", JSON.stringify(snap));
        break;
      }
    }
    page.off("popup", onPopup);
  } catch (e) {
    log("LOOT_LIVE_ERR", String(e).slice(0, 120));
  } finally {
    await page.close().catch(() => {});
  }
  log("LOOT_LIVE_TIMEOUT_FALLBACK_WS");
  const out = await bypassLootLabsFromHtml(lootUrl, html, log);
  log("LOOT_API_RESULT", out ? out.slice(0, 160) : "null");
  return out;
}

export async function solveDelta(ticket, log = () => {}) {
  const keyNow = await sessionKey(ticket);
  if (keyNow) { log("WHITELISTED_OR_DONE", keyNow); return { key: keyNow, source: "status" }; }

  const browser = await puppeteer.launch({
    headless: "new",
    args: LAUNCH_ARGS,
    defaultViewport: VIEWPORT
  });
  let currentTicket = ticket;
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      log("ROUND", round, "ticket=" + currentTicket.slice(0, 24) + "...");
      const page = await openTicketPage(browser, currentTicket, log);
      const ui = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
      log("UI", ui.replace(/\n+/g, " | ").slice(0, 240));

      if (/whitelist|successful/i.test(ui)) {
        await new Promise((r) => setTimeout(r, 2000));
        const k = await sessionKey(currentTicket);
        if (k) { await page.close().catch(() => {}); return { key: k, source: "status" }; }
      }

      const lootUrl = await clickContinueAndGetLoot(page, log);
      await page.close().catch(() => {});
      if (!lootUrl) { log("NO_LOOT_URL"); break; }

      const html = await grabLootDom(browser, lootUrl, log);
      if (!html) { log("NO_LOOT_DOM"); break; }
      log("HTML_BYTES", html.length);

      const dest = await runLootLiveThenWs(browser, lootUrl, html, log);
      if (!dest) {
        log("LOOT_FAILED_WS_RECHECK");
        const k2 = await sessionKey(currentTicket);
        if (k2) { log("KEY_FROM_STATUS_AFTER_LOOT", k2); return { key: k2, source: "status" }; }
        log("LOOT_FAILED"); break;
      }

      const k = await sessionKey(currentTicket);
      if (k) return { key: k, source: "loot" };

      const m = dest.match(/[?&]d=([^&]+)/);
      if (m) { currentTicket = m[1]; continue; }
      if (dest.includes("auth.platorelay.com")) {
        currentTicket = dest.split("d=")[1] || "";
        if (currentTicket) continue;
      }
      log("UNKNOWN_DEST", dest.slice(0, 140));
      break;
    }
    return { key: null, error: "no key after " + MAX_ROUNDS + " rounds" };
  } finally {
    await browser.close().catch(() => {});
  }
}