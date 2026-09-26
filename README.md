# 🏫 校園智慧行事曆 Agent (大溪國中智慧會議協作系統)

> **專為校園行政徹底減量量身打造**：整合 Google Gemini 生成式 AI 與 Google Sheets 雲端無伺服器架構的智慧排程與行政協作平台。

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-success?style=for-the-badge&logo=github)](https://coolokey.github.io/dsjh-ai-calendar/)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Google%20Gemini%202.0%20%2F%201.5-8e24aa?style=for-the-badge&logo=google)](https://aistudio.google.com/)
[![Backend](https://img.shields.io/badge/Backend-Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-sheets)](https://script.google.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

## 🔗 即時線上體驗與公開儲存庫

* 🌐 **GitHub Pages 即時體驗網址**：[https://coolokey.github.io/dsjh-ai-calendar/](https://coolokey.github.io/dsjh-ai-calendar/)
* 📦 **GitHub 公開原始碼儲存庫**：[https://github.com/coolokey/dsjh-ai-calendar](https://github.com/coolokey/dsjh-ai-calendar)

> 💡 **免設定開箱即用**：前端已預設連結已部署之 Google Apps Script 雲端後端，同時內建「AI 展示模式」備援機制，免手動設定即可直接連線 Google Sheets 資料庫與體驗 AI 會議協作功能！

---

## 🌟 系統五大核心特色

```
                           ┌──────────────────────────┐
                           │   第一線教師 / 行政承辦人  │
                           └─────────────┬────────────┘
                                         │ 貼上公文 / 語音自然語言對話
                                         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                        校園智慧行事曆 Agent 前端 (Web)                  │
  │  • RWD 自適應月/週/日/清單檢視  • 實時衝突防擋演算法  • 一鍵匯出 CSV 試算表  │
  └──────────────────────────────────────┬─────────────────────────────────┘
                                         │ HTTPS (REST API)
                                         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                   Google Apps Script (GAS) 雲端後端                    │
  │    • SHA-256 密碼雜湊防誤改防誤刪   • 即時健康度連線診斷 (Ping API)      │
  └───────────────────────┬────────────────────────┬───────────────────────┘
                          │                        │ 伺服器端環境變數 (保護 API Key)
                          ▼                        ▼
  ┌─────────────────────────────────┐   ┌──────────────────────────────────┐
  │ Google Sheets (雲端試算表資料庫)  │   │   Google Gemini 2.0 / 1.5 API   │
  │ • 零建置成本 • 權限控管 • 永久留存 │   │ • 資訊萃取 • 推播文案 • 議程規劃  │
  └─────────────────────────────────┘   └──────────────────────────────────┘
```

1. **✨ AI 公文 / 處室通知「一鍵速填」**
   - 直接貼上繁複的教育局公文、處室內部 Email 或 LINE 群組公告文字，Gemini AI 於 1 秒內精準萃取「會議名稱、日期、起訖時段、地點、主辦單位、重點摘要」，連「下週三第2節」等相對時間皆自動精確轉化。
2. **🤖 AI 智慧排程秘書自然語言對話**
   - 支援口語對話（如：「下週二下午第二會議室有沒有空？」、「我想約週五下午課發會」），AI 自動分析全校會議資料庫，推薦最佳空檔並預先警示衝突。
3. **📋 會議推播稿與標準議程草案一鍵生成**
   - 會議排定後，點擊「生成推播文案」或「產出議程範本」，AI 立即自動擬定適合 LINE 官方群組發布之親切通知與 5 大階段標準公務會議議程草稿。
4. **🛡️ 嚴格場地衝突防擋與資安合規**
   - **毫秒級防撞**：同日期、同地點、同時段重疊演算法（`startA < endB && endA > startB`）即時攔截並提示搶場地詳情。
   - **完整 CRUD 編輯與防誤刪**：支援會議排程線上修改與刪除，每筆會議具備專屬 SHA-256 密碼雜湊防護。
   - **金鑰保護**：Gemini API Key 僅儲存於 Google Apps Script 伺服器端（Script Properties），前端程式碼絕不暴露任何機敏金鑰。
5. **⚙️ 動態雲端設定與連線診斷 (Ping)**
   - 支援在網頁介面直接貼入 GAS Web App 網址與即時 Ping 測試連線，隨時在「正式雲端」與「展示環境」之間無縫切換。

---

## 📂 專案檔案清單

| 檔案路徑 | 說明 |
| :--- | :--- |
| `index.html` | 前端單一應用程式頁面（支援桌機、平板、手機自適應，支援本地展示模式與正式雲端同步，支援 CSV 匯出） |
| `gas_code.gs` | Google Apps Script 雲端後端程式碼（整合 Google Sheets 試算表與 Gemini REST API） |
| `appsscript.json` | Google Apps Script 專案設定檔 |
| `proposal_docs/` | **桃園市「AI好幫手」智慧行政徵選競賽專用文件** |
| ├─ `01_提案申請書草稿.md` | 競賽線上報名表（附件一）完整撰寫稿（可直接複製填報） |
| ├─ `02_資安與倫理自我檢核表.md` | 附件二資安與倫理檢核標準逐題解析與評估解答 |
| └─ `03_三分鐘示範短片腳本.md` | 錄製競賽 3 分鐘展示影片之分鏡與解說講稿 |

---

## 🚀 三分鐘快速建置正式雲端服務

### Step 1：建立 Google 試算表與貼上後端程式碼
1. 開啟 [Google Sheets 試算表](https://sheets.google.com)，新建一個空白試算表（例如命名為：`校園智慧行事曆資料庫`）。
2. 點選頂端選單 **「擴充功能」 ➔ 「Apps Script」**。
3. 將本專案中的 `gas_code.gs` 完整內容覆蓋貼入編輯器中的 `Code.gs`。
4. 按 `Ctrl + S` 儲存專案。

### Step 2：設定免費 Gemini API Key (資安合規)
1. 前往 [Google AI Studio](https://aistudio.google.com/)，點選 **「Get API key」** 建立一組金鑰（免費方案每分鐘 15 次請求，學校日常排程使用綽綽有餘）。
2. 回到剛才的 Google Apps Script 頁面：
   - 點選左側齒輪選單 ⚙️ **「專案設定」**（Project Settings）。
   - 向下捲動至 **「指令碼屬性」**（Script Properties），點擊 **「新增指令碼屬性」**：
     - **屬性 (Property)**：`GEMINI_API_KEY`
     - **值 (Value)**：貼上剛才取得的 Gemini API 金鑰。
   - 點擊 **「儲存指令碼屬性」**。

### Step 3：部署為 Web 應用程式 (Web App)
1. 點擊 Apps Script 右上角 **「部署」 ➔ 「新增部署」**。
2. 點選左側齒輪，選擇 **「網頁應用程式」** (Web App)。
3. 設定如下：
   - **說明**：校園智慧行事曆 AI Agent v3.5
   - **執行身分**：**我 (你的 Google 帳號)**
   - **誰可以存取**：**所有人 (含匿名使用者)**
4. 點擊 **「部署」**，並授予必要存取權限。
5. **複製 Web App 網址**（格式類似 `https://script.google.com/macros/s/AKfycb.../exec`）。

### Step 4：於前端介面一鍵套用連線
1. 開啟 [https://coolokey.github.io/dsjh-ai-calendar/](https://coolokey.github.io/dsjh-ai-calendar/)。
2. 點擊右上角 **「⚙️ 設定圖示」** 或頂端黃色橫幅。
3. 將剛才複製的 Web App 網址貼入輸入框中。
4. 點擊 **「測試連線 (Ping)」**，確認顯示綠色勾勾後，點擊 **「儲存並套用」**。
5. 恭喜！網頁已無縫切換為正式雲端模式，所有排程即刻同步寫入 Google Sheets！

---

## 🏆 競賽文件指引 (桃園市教育局「AI好幫手」專用)

為方便學校行政團隊快速報名與繳件，本專案於 `proposal_docs/` 提供完整且符合教育局評分指標的各項文件：

1. **[01_提案申請書草稿.md](proposal_docs/01_提案申請書草稿.md)**：包含完整問題描述、需求分析、AI解決策略、技術突破亮點與量化效益分析（工作時間節省 50% 以上）。
2. **[02_資安與倫理自我檢核表.md](proposal_docs/02_資安與倫理自我檢核表.md)**：依據資通安全管理法逐題撰寫具體防禦對策，並明確切結「AI 預擬、人工核決」原則。
3. **[03_三分鐘示範短片腳本.md](proposal_docs/03_三分鐘示範短片腳本.md)**：精準控制在 2 分 45 秒以內的操作示範影片分鏡與逐字口播講稿。

---

## 📄 授權條款

本專案採用 [MIT License](LICENSE) 開源授權，歡迎各級學校與教育工作者自由使用、修改與推廣。
