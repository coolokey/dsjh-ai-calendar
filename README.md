# 校園智慧行事曆 Agent (大溪國中智慧會議協作系統)

> 專為校園行政減量量身打造：整合 Google Gemini 生成式 AI 與 Google Sheets 雲端架構的智慧排程協作平台。

---

## 🌟 系統亮點特色

1. **✨ AI 公文 / 通知文字一鍵智能解析**
   - 直接貼上繁雜的處室通知、公文主旨說明或 Line 群組文字，Gemini AI 自動精準擷取「會議標題、日期、起訖時間、地點、主辦單位、重點摘要」，一秒自動填入預約表單。
2. **🤖 AI 智慧秘書對話排程**
   - 支援自然語言對話（如：「幫我查下週二下午第二會議室有沒有空？」、「我想約週五下午課發會」），AI 自動比對全校行事曆資料庫，提出排程建議並即時偵測衝突。
3. **📋 會議通知與議程草案一鍵生成**
   - 會議登記後，點擊「生成推播文案」或「產出議程範本」，由 AI 自動擬定適合 LINE 官方群組發布的親切公告與 5 大階段標準會議議程草稿。
4. **🛡️ 嚴格的場地時段衝突防擋與資安設計**
   - 同日期、同時段、同地點之會議衝突自動攔阻，並提示衝突之會議詳情。
   - 每筆會議具備獨立 SHA-256 密碼雜湊防誤刪機制。
   - **資安合規**：Gemini API Key 僅儲存於 Google Apps Script 後端（環境變數），絕不洩漏前端，符合學校資安防護規範。
5. **📅 靈活多維檢視**
   - 提供**月曆、週曆、日曆、總清單**四種檢視模式，支援關鍵字即時搜尋與處室分類篩選，並可一鍵匯出 / 列印 PDF。

---

## 📂 專案檔案清單

| 檔案路徑 | 說明 |
| :--- | :--- |
| `index.html` | 前端單一應用程式頁面（支援桌機、平板、手機自適應，可置於 NAS、GitHub Pages 或任何 Web 伺服器） |
| `gas_code.gs` | Google Apps Script 雲端後端程式碼（整合 Google Sheets 與 Gemini REST API） |
| `appsscript.json` | Google Apps Script 專案設定檔 |
| `proposal_docs/` | 桃園市「AI好幫手」智慧行政徵選競賽專用文件資料夾 |
| ├─ `01_提案申請書草稿.md` | 競賽線上報名表（附件一）完整撰寫稿（可直接複製填報） |
| ├─ `02_資安與倫理自我檢核表.md` | 附件二資安與倫理檢核標準逐題解析與評估解答 |
| └─ `03_三分鐘示範短片腳本.md` | 錄製競賽 3 分鐘展示影片之分鏡與解說詞 |

---

## 🚀 三分鐘快速部署指南

### Step 1：建立 Google 試算表與貼上後端程式碼
1. 開啟 [Google Sheets 試算表](https://sheets.google.com)，新建一個空白試算表。
2. 點選頂端選單 **「擴充功能」 ➔ 「Apps Script」**。
3. 將本專案中的 `gas_code.gs` 完整內容覆蓋貼入編輯器中的 `Code.gs`。
4. 按 `Ctrl + S` 儲存專案。

### Step 2：設定免費 Gemini API Key (資安合規)
1. 前往 [Google AI Studio](https://aistudio.google.com/)，點選 **「Get API key」** 建立一組金鑰（免費方案額度充足且極快）。
2. 回到剛才的 Google Apps Script 頁面：
   - 點選左側選單的 ⚙️ **「專案設定」**（Project Settings）。
   - 向下捲動至 **「指令碼屬性」**（Script Properties），點擊 **「新增指令碼屬性」**：
     - **屬性 (Property)**：`GEMINI_API_KEY`
     - **值 (Value)**：貼上剛才取得的 Gemini API 金鑰。
   - 點擊 **「儲存指令碼屬性」**。
   *(如此一來金鑰完全被 Google 伺服器端保護，前端程式碼不會暴露任何機敏金鑰)*

### Step 3：部署為 Web 應用程式 (Web App)
1. 點擊 Apps Script 右上角 **「部署」 ➔ 「新增部署」**。
2. 點選左側齒輪，選擇 **「網頁應用程式」** (Web App)。
3. 設定如下：
   - **說明**：校園智慧行事曆 AI Agent
   - **執行身分**：**我 (你的 Google 帳號)**
   - **誰可以存取**：**所有人 (含匿名使用者)**
4. 點擊 **「部署」**，並授予必要授權。
5. **複製 Web App 網址**（格式類似 `https://script.google.com/macros/s/..../exec`）。

### Step 4：設定前端網頁並上傳
1. 用文字編輯器開啟本專案的 `index.html`。
2. 找到第 585 行附近的常數設定：
   ```javascript
   const GAS_API_URL = 'DEMO_MODE';
   ```
   將 `'DEMO_MODE'` 替換為剛才複製的 Web App 網址，例如：
   ```javascript
   const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxxxxxxx/exec';
   ```
3. 儲存檔案。將 `index.html` 上傳至學校 NAS 的 Web 目錄，或任何內網/外網伺服器即可直接使用！

---

## 💡 本地預覽體驗（免設定直接把玩）
若尚未完成 Google Apps Script 部署，直接使用瀏覽器雙擊開啟 `index.html`，系統將自動啟動**「AI 展示模式 (DEMO MODE)」**：
- 內建 4 筆真實會議資料。
- 點選「✨ AI 公文速填」，可直接點選「範例 1、2、3」體驗 AI 瞬間辨識與自動填表。
- 點選「🤖 AI 智慧秘書」，可直接與 AI 對話詢問場地空檔與排程建議。
- 點擊任一會議，可測試一鍵生成 LINE 推播文字與議程草稿。
