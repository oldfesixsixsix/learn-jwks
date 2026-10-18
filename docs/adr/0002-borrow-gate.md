# 進書前驗證 JWT + 借閱狀態,不再是純靜態站台

**Status**: accepted

**背景**:`library` 新增借閱系統(見 `oldfesixsixsix/library` 的 ADR-0003),登入即借閱,借閱狀態查核由各下游 Worker 自己做,不是 `library` 當 gateway 擋在前面轉發。

**決定**:
- Worker 新增 JWT 驗證中介層(驗 `unclereal-auth-cf` 核發、存在 `Domain=unclereal.com` cookie 裡的 token),跟 `library` 共用同一個 D1 資料庫(`book`/`loan` 表)。
- 沒登入 → 導去登入;登入但沒有這本書的有效借閱紀錄且還有名額 → 自動建一筆借閱後放行;名額滿 → 擋下。
- 原本純靠 `ASSETS` binding 轉發的 `worker.js`(見 ADR-0001)要加上這層驗證,不再是單純的靜態檔案轉發。

**後果**:
- 從「純靜態、沒有 API」變成需要 JWT 驗證 + D1 查詢才能放行內容,跟 `ledger` 的複雜度相當。
