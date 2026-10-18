import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * 路徑前綴掛載時（見 docs/adr/0001），assets.base_path 這個帳號還沒開放（跟
 * ledger 一樣，見該專案 docs/adr/0002），所以這支 Worker 自己剝 BASE_PATH 前綴後
 * 轉給 ASSETS binding 讀靜態檔案。
 *
 * 借閱閘門（見 docs/adr/0002、library 的 docs/adr/0003）：不登入也能直接看內容
 * （像在圖書館現場翻書不用借書證），不擋任何人。唯一的差別是：如果剛好帶著
 * library 核發、存在 Path=/library cookie 裡的有效 JWT，就順手記一筆借閱——
 * 純粹是記錄，不是門檻，名額滿了也只是不記這筆，一樣照樣放行看內容。
 * 跟 library 共用同一個 D1 資料庫（book/loan 表），這裡只讀 book.capacity、寫
 * loan，不處理圖書註冊或查詢自己借閱紀錄那些 library 自己的事。
 */

const AUTH_ORIGIN = "https://auth.unclereal.com";
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

/**
 * 已登入時順手記一筆借閱，純粹記錄用，不影響放行——名額滿了就跳過不記，
 * 呼叫端永遠不用管這支函式的結果，內容一樣照樣給。
 */
async function recordBorrowIfLoggedIn(env, userId) {
  if (!userId) return;
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT id FROM loan WHERE book_id = ? AND user_id = ? AND returned_at IS NULL AND expires_at > ? LIMIT 1",
  )
    .bind(BOOK_ID, userId, now)
    .first();
  if (existing) return;

  const book = await env.DB.prepare("SELECT capacity FROM book WHERE id = ?").bind(BOOK_ID).first();
  const capacity = book ? book.capacity : 100;
  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM loan WHERE book_id = ? AND returned_at IS NULL AND expires_at > ?",
  )
    .bind(BOOK_ID, now)
    .all();
  if (results[0].n >= capacity) return; // 額滿，不記這筆，照樣放行看內容

  await env.DB.prepare(
    "INSERT INTO loan (id, book_id, user_id, borrowed_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), BOOK_ID, userId, now, now + LOAN_TTL_MS)
    .run();
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
    await recordBorrowIfLoggedIn(env, userId);

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
