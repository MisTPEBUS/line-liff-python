# LINE LIFF QR Code POC

這是一個 LINE LIFF QR Code 掃描 POC：frontend 取得 LINE Profile 與 QR Code 內容後，將資料送到 FastAPI backend。backend 僅驗證資料、顯示到 Console 並回傳成功結果，不會儲存資料。

## 專案結構

```text
line-liff-python/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   ├── .env
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── config.js
│   └── style.css
├── .gitignore
└── READ.md
```

## 系統需求

- Python 3.12+
- ngrok（只有需要從外網或 LINE LIFF 存取本機服務時才需要）
- 已建立的 LINE LIFF App

## 1. 啟動 backend

在 PowerShell 進入 backend：

```powershell
cd C:\Users\user\Documents\line-liff-python\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

如果 PowerShell 不允許啟用 virtual environment，可只在目前終端機暫時調整：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

啟動後可開啟：

- Health check：<http://127.0.0.1:8000/>
- Swagger：<http://127.0.0.1:8000/docs>
- LINE Webhook：`POST http://127.0.0.1:8000/webhook`

## 2. 設定與啟動 frontend

本機開發時，確認 `frontend/config.js` 使用本機 backend：

```javascript
window.APP_CONFIG = {
  LIFF_ID: "你的_LIFF_ID",
  API_URL: "http://127.0.0.1:8000",
};
```

開啟另一個 PowerShell，在專案根目錄啟動靜態檔案伺服器：

```powershell
cd C:\Users\user\Documents\line-liff-python
python -m http.server 5500 --directory frontend
```

然後開啟：

```text
http://127.0.0.1:5500
```

不要直接雙擊 `index.html`，否則頁面會使用 `file://` origin，可能造成 CORS 或瀏覽器 API 問題。

## 3. 本機資料流程

```text
Frontend http://127.0.0.1:5500
    │
    │ POST http://127.0.0.1:8000/api/qrcode
    ▼
FastAPI http://127.0.0.1:8000
    │
    ├─ Pydantic validation
    ├─ Console 顯示資料
    └─ 200 JSON response
```

送出的 JSON：

```json
{
  "lineUserId": "U123456789abcdef",
  "lineName": "王小明",
  "qrCodeValue": "BUS-QR-001"
}
```

## 4. 使用 ngrok 暴露 backend

先安裝 ngrok、登入 ngrok Dashboard 取得 authtoken，然後在 PowerShell 設定一次：

```powershell
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

不要把 authtoken 寫進 Git、`config.js`、`.env.example` 或文件。

保持 FastAPI 在 port 8000 執行，再開啟另一個 PowerShell：

```powershell
ngrok http 8000
```

ngrok 會顯示一個公開 HTTPS URL，例如：

```text
https://example-name.ngrok-free.app
```

將 `frontend/config.js` 的 `API_URL` 改為該 URL，結尾不要加 `/api/qrcode`：

```javascript
window.APP_CONFIG = {
  LIFF_ID: "你的_LIFF_ID",
  API_URL: "https://example-name.ngrok-free.app",
};
```

frontend 會自行呼叫：

```text
https://example-name.ngrok-free.app/api/qrcode
```

可先確認以下網址能正常顯示：

```text
https://example-name.ngrok-free.app/
https://example-name.ngrok-free.app/docs
```

在 LINE Developers Console 的 Messaging API 頁面，將 Webhook URL 設為：

```text
https://example-name.ngrok-free.app/webhook
```

接著啟用 `Use webhook` 並按下 `Verify`。LINE 的驗證請求會使用空的 `events` 陣列，backend 仍會正常回傳 HTTP 200。

免費 ngrok URL 可能在重新啟動後改變；變更後要同步更新 `frontend/config.js`。

## 5. 從 LINE LIFF 開啟本機 frontend

LIFF Endpoint URL 必須是可由手機存取的 HTTPS URL。本機 frontend 在 port 5500 執行時，可另開一條 tunnel：

```powershell
ngrok http 5500
```

假設 frontend tunnel 是：

```text
https://example-frontend.ngrok-free.app
```

需要同步做兩項設定：

1. 在 LINE Developers Console 將 LIFF Endpoint URL 設為 frontend tunnel URL。
2. 在 `backend/.env` 將 frontend tunnel 的 origin 加入 `FRONTEND_ORIGINS`。

```env
APP_ENV=development
APP_HOST=127.0.0.1
APP_PORT=8000

FRONTEND_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,https://example-frontend.ngrok-free.app
```

修改 `.env` 後重新啟動 Uvicorn。`FRONTEND_ORIGINS` 只能填 origin，不要加入路徑或結尾斜線。

同時需要確認 `frontend/config.js` 的 `API_URL` 指向 backend 的 ngrok HTTPS URL，而不是 frontend URL。

> ngrok 方案可能限制同時執行的 agent 或 endpoint 數量。如果無法同時建立兩條 tunnel，可將 frontend 部署到 GitHub Pages，只用 ngrok 暴露 backend。

## 6. GitHub Pages + 本機 ngrok backend

如果 frontend 已部署至：

```text
https://lobinda.github.io/line-liff-qrcode/
```

backend `.env` 應加入 GitHub Pages origin：

```env
FRONTEND_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,https://lobinda.github.io
```

注意 origin 是 `https://lobinda.github.io`，不包含 `/line-liff-qrcode/`。

GitHub Pages 上的 `config.js` 則設定 backend ngrok URL：

```javascript
window.APP_CONFIG = {
  LIFF_ID: "你的_LIFF_ID",
  API_URL: "https://example-name.ngrok-free.app",
};
```

## 7. API 測試

Swagger：

```text
http://127.0.0.1:8000/docs
```

PowerShell curl：

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/qrcode" `
  -H "Content-Type: application/json" `
  -d "{\"lineUserId\":\"U123456789abcdef\",\"lineName\":\"王小明\",\"qrCodeValue\":\"BUS-QR-001\"}"
```

若 PowerShell 傳送中文時發生編碼問題，優先使用 Swagger 測試。

成功回應：

```json
{
  "status": "success",
  "message": "資料接收成功"
}
```

Webhook 空事件驗證測試：

```powershell
curl.exe -X POST "http://127.0.0.1:8000/webhook" `
  -H "Content-Type: application/json" `
  -d "{\"destination\":\"U123456789abcdef\",\"events\":[]}"
```

成功時回傳：

```json
{
  "status": "success",
  "message": "Webhook 接收成功"
}
```

## 8. POC 安全性限制

目前 frontend 傳入的 `lineUserId` 與 `lineName` 未經後端驗證，只適合 POC，不可作為正式身分認證。`POST /webhook` 目前也只接收並顯示事件，尚未驗證 `x-line-signature`，不可直接用於正式環境或執行敏感操作。

正式版本應由 frontend 傳送：

```json
{
  "idToken": "...",
  "qrCodeValue": "..."
}
```

再由 backend 驗證 LINE ID Token 並取得可信任的 LINE User ID。本版本刻意不實作 Token 驗證、Webhook Channel Secret 簽章驗證、資料庫或 Authentication。正式處理 LINE webhook 事件前，必須使用未經修改的原始 request body、Channel Secret 與 `x-line-signature` 驗證來源。
