import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * 路徑前綴掛載時（見 docs/adr/0001），assets.base_path 這個帳號還沒開放（跟
 * ledger 一樣，見該專案 docs/adr/0002），所以這支 Worker 自己剝 BASE_PATH 前綴後
 * 轉給 ASSETS binding 讀靜態檔案。
 *
 * 借閱閘門（見 docs/adr/0002、library 的 docs/adr/0003）：登入即借閱，登入狀態
 * 走 unclereal-auth-cf 核發、library 的 /auth/login 設在 Path=/library 的 cookie
 * （跟 library 同源，這支 Worker 讀得到）。沒登入就導去 library 的登入進出口；
 * 已登入但沒有這本書的有效借閱紀錄、且名額還夠，就自動借一筆再放行；滿了就擋下。
 * 跟 library 共用同一個 D1 資料庫（book/loan 表），這裡只讀 book.capacity、寫
 * loan，不處理圖書註冊或查詢自己借閱紀錄那些 library 自己的事。
 */

const AUTH_ORIGIN = "https://auth.unclereal.com";
const LIBRARY_PATH = "/library";
const BOOK_ID = "jwks";
const LOAN_TTL_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = "unclereal_jwt";

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

let authJwks;
/** 讀 library 設的 cookie，驗簽章 + issuer，回傳 userId（sub）或 null。 */
async function verifyUser(request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  if (!authJwks) authJwks = createRemoteJWKSet(new URL(`${AUTH_ORIGIN}/api/auth/jwks`));
  try {
    const { payload } = await jwtVerify(token, authJwks, { issuer: AUTH_ORIGIN });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** 沒有有效借閱紀錄時，額滿就回擋下訊息，有名額就建一筆借閱。成功放行回 null。 */
async function ensureBorrowed(env, userId) {
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT id FROM loan WHERE book_id = ? AND user_id = ? AND returned_at IS NULL AND expires_at > ? LIMIT 1",
  )
    .bind(BOOK_ID, userId, now)
    .first();
  if (existing) return null;

  const book = await env.DB.prepare("SELECT capacity FROM book WHERE id = ?").bind(BOOK_ID).first();
  const capacity = book ? book.capacity : 100;
  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM loan WHERE book_id = ? AND returned_at IS NULL AND expires_at > ?",
  )
    .bind(BOOK_ID, now)
    .all();
  if (results[0].n >= capacity) {
    return new Response("這本書目前借閱額滿，請稍後再試。", { status: 503 });
  }

  await env.DB.prepare(
    "INSERT INTO loan (id, book_id, user_id, borrowed_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), BOOK_ID, userId, now, now + LOAN_TTL_MS)
    .run();
  return null;
}

export default {
  async fetch(request, env) {
    if (!env.BASE_PATH) return env.ASSETS.fetch(request);

    const url = new URL(request.url);
    // 補結尾斜線，不然瀏覽器會把前綴最後一段當檔名解析相對路徑，導致 CSS/JS 漏前綴
    if (url.pathname === env.BASE_PATH) {
      url.pathname = `${env.BASE_PATH}/`;
      return Response.redirect(url.toString(), 301);
    }
    if (!url.pathname.startsWith(env.BASE_PATH)) return new Response("Not Found", { status: 404 });

    const userId = await verifyUser(request);
    if (!userId) {
      const login = new URL(`${url.origin}${LIBRARY_PATH}/auth/login`);
      login.searchParams.set("return_to", url.pathname + url.search);
      return Response.redirect(login.toString(), 302);
    }
    const blocked = await ensureBorrowed(env, userId);
    if (blocked) return blocked;

    url.pathname = url.pathname.slice(env.BASE_PATH.length) || "/";
    const res = await env.ASSETS.fetch(new Request(url, request));

    // ASSETS 自己的 html_handling（例如 /lesson-01.html -> /lesson-01）會發出相對於
    // 剝完前綴那個路徑空間的 Location，瀏覽器收到會漏掉 BASE_PATH，所以這裡補回去。
    const location = res.headers.get("Location");
    if (location?.startsWith("/")) {
      const fixed = new Headers(res.headers);
      fixed.set("Location", `${env.BASE_PATH}${location}`);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: fixed });
    }
    return res;
  },
};
