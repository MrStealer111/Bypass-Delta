import puppeteer from "puppeteer";
import { bypassLootLabsFromHtml } from "/opt/bypass-delta/lib/lootlink.js";

const MAX_ROUNDS = 4;
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"];
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
    await page.goto(lootUrl.replace(/&amp;/g, "&"), { waitUntil: "domcontentloaded", timeout: 60000 });
    const deadline = Date.now() + 240000;
    let last = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const u = page.url();
      if (u !== last) { log("LOOT_URL_CHANGE", u.slice(0, 130)); last = u; }
      if (u.startsWith("http") && !/lootlabs|loot\.link|work\.ink|boost\.ink/.test(u)) {
        log("LOOT_REDIRECTED", u.slice(0, 140));
        return u;
      }
    }
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
      if (!dest) { log("LOOT_FAILED"); break; }

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