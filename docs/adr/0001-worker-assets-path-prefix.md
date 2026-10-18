# 從 Cloudflare Pages 改成 Worker + assets,掛在 unclereal.com/library/jwks

**Status**: accepted

**背景**:完整背景與考慮過的替代方案見 `library` 專案的 ADR-0001(同一次集中式路徑前綴改版的一部分,`learn-jwks` 是其中一個獨立掛載的子站)。

**決定**:
- 改成 Worker + assets 部署(`wrangler.jsonc` + `assets.directory`),取代原本的 `wrangler pages deploy` / Git 自動部署。
- Worker Route 設為 `unclereal.com/library/jwks*`(`zone_name: "unclereal.com"`),優先權高於 `library` 本身的 catch-all 與 `unclereal-home` 的 root catch-all。
- 不跟 `library`、`retirement-planning-101` 合併成單一 Worker,維持獨立部署生命週期。

**後果**:
- 原本「push 到 GitHub 就自動部署」的 Pages Git 整合,換成要手動(或另外設定 Workers Builds)跑 `wrangler deploy`。
- 舊網址(若曾經有獨立子網域)直接停止回應,不設轉址。
