# IELTS Grammar Coach

一個結合 Claude API 的 IELTS 英文文法練習與寫作分析工具，包含「寫作分析」「文法練習」「進度追蹤」三大頁面。

## 架構

```
ielts-grammar-coach/
├── client/     # Vite + React 前端
└── server/     # Express 後端（proxy Claude API + 儲存資料）
```

前端**不會**直接呼叫 Anthropic API（瀏覽器端無法安全存放 API Key，也會被 CORS 擋下）。所有請求先送到本機的 Express 後端，由後端夾帶 API Key 轉發給 `https://api.anthropic.com/v1/messages`。

資料（寫作分析紀錄、練習紀錄、答對率統計）儲存在 Supabase（Postgres 資料庫），後端用 `service_role` key 連線讀寫，前端完全不會直接接觸 Supabase。

## 第一次設定

1. 安裝需求：Node.js 18 以上版本。

2. 安裝所有相依套件（前端 + 後端）：

   ```bash
   cd ~/Desktop/Projects/ielts-grammar-coach
   npm run install:all
   ```

3. 設定 API Key：

   ```bash
   cp server/.env.example server/.env
   ```

   打開 `server/.env`，填入你的 Anthropic API Key 和 Supabase 連線資訊：

   ```
   ANTHROPIC_API_KEY=sk-ant-你的key
   CLAUDE_MODEL=claude-sonnet-4-5-20250929
   PORT=5174
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   > `CLAUDE_MODEL` 可依 Anthropic Console 上顯示的最新可用型號調整，若原本指定的 `claude-sonnet-4-6` 之後正式發布，直接把這個值改掉即可，不需要改程式碼。
   >
   > Supabase 的 Project URL 和 `service_role`（或新版 `sb_secret_...`）key 在 Supabase 專案的 Settings → API 頁面可以找到。

4. 建立資料表：到 Supabase 專案左側選單 **SQL Editor** → **New query**，把 `server/supabase-schema.sql` 這個檔案的內容整份貼上去，按 **Run** 執行一次即可（只需要做一次，之後不用重複）。

## 啟動（本地開發）

在專案根目錄執行：

```bash
npm run dev
```

這會同時啟動：
- 後端：`http://localhost:5174`
- 前端：`http://localhost:5173`（瀏覽器打開這個網址使用）

前端開發伺服器已設定 proxy，所有 `/api/*` 請求會自動轉發到後端，不需要額外設定。

如果想分開啟動兩個服務，也可以開兩個終端機視窗分別執行：

```bash
npm run dev:server
npm run dev:client
```

## 資料儲存位置

所有寫作分析結果、練習紀錄、答對率統計都存在 Supabase 的 Postgres 資料庫（`writing_analyses`、`practice_attempts` 兩張表），跟本機或部署平台的檔案系統無關，重開機、重新部署都不會遺失。若想清空所有紀錄重新開始，到 Supabase 的 **Table Editor** 把這兩張表的資料手動刪除即可，或在 SQL Editor 執行 `truncate writing_analyses, practice_attempts;`。

## 常見問題

**Q: 顯示「ANTHROPIC_API_KEY 未設定」錯誤？**
檢查 `server/.env` 是否存在且已填入正確的 Key，並重新啟動後端（`npm run dev:server`）。

**Q: 前端打不開 / 顯示連線錯誤？**
確認後端（port 5174）有正常啟動，且沒有被其他程式佔用該 port。

**Q: 想部署到正式環境？**
見下方「部署到正式環境」章節。

## 部署到正式環境

前後端要分開部署：後端需要一個能保管環境變數（API Key）的 Node.js 主機；前端可以用任何靜態網站託管服務。

### 1. 部署後端（以 Render 為例，Railway / Fly.io 步驟類似）

1. 把整個專案推到 GitHub。
2. 在 Render 建立一個新的 Web Service，指向這個 repo，設定：
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. 在該服務的環境變數（Environment）設定：
   - `ANTHROPIC_API_KEY`：你的 Anthropic API Key
   - `CLAUDE_MODEL`：例如 `claude-sonnet-4-5-20250929`
   - `CORS_ORIGIN`：先留空，等前端部署好拿到網址後再回來填
   - `SUPABASE_URL`：你的 Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`：你的 Supabase `service_role` / `sb_secret_...` key
4. 部署完成後會拿到一個網址，例如 `https://ielts-grammar-coach.onrender.com`。

> 資料存在 Supabase，不受 Render 免費方案「檔案系統重啟即清空」的限制，重新部署、服務休眠喚醒都不會遺失資料。

### 2. 部署前端（以 Vercel 為例，Netlify 步驟類似）

1. 複製 `client/.env.example` 為 `client/.env`，填入後端網址（結尾要有 `/api`）：

   ```
   VITE_API_BASE_URL=https://ielts-grammar-coach.onrender.com/api
   ```

2. 在 Vercel 建立新專案，指向這個 repo，設定：
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. 在 Vercel 的環境變數也設定一次 `VITE_API_BASE_URL`（跟 `.env` 內容一樣），因為建置是在 Vercel 上執行，讀的是它平台上的環境變數。
4. 部署完成後會拿到前端網址，例如 `https://ielts-grammar-coach.vercel.app`。

### 3. 回頭設定後端的 CORS_ORIGIN

拿到前端網址後，回到 Render 把 `CORS_ORIGIN` 填成前端網址（例如 `https://ielts-grammar-coach.vercel.app`），儲存後服務會自動重啟。這樣可以限制只有你的前端網站能呼叫這個 API，避免其他人盜用你的後端轉發額度。

完成以上三步，就可以用瀏覽器打開前端網址，在任何裝置上使用，不需要再開本機終端機。
