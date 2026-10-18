/**
 * 純靜態站台，沒有 API。路徑前綴掛載時（見 docs/adr/0001），
 * assets.base_path 這個帳號還沒開放（跟 ledger 遇到的一樣，見該專案 docs/adr/0002），
 * 所以這支 Worker 自己剝 BASE_PATH 前綴後，轉給 ASSETS binding 讀靜態檔案。
 * 本機開發沒有設 BASE_PATH，直接原樣轉給 ASSETS。
 */
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
    url.pathname = url.pathname.slice(env.BASE_PATH.length) || "/";
    const res = await env.ASSETS.fetch(new Request(url, request));

    // ASSETS 自己的 html_handling（例如 /lesson1.html -> /lesson1）會發出相對於
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
