# SPEC.md — LINE LIFF QR 掃描（施工規格）

> 本文件為 **AI coding agent 施工藍圖**，自足可讀，無需其他文件。
> 前端 Vanilla JS + LIFF SDK v2 + html5-qrcode（CDN，無建置工具）；後端 Python FastAPI。

---

## 0. 一句話目標

使用者於 LIFF 內取得 `userId` / `displayName` → 掃描 QR Code（原生優先、相機備援）→ 顯示值 → `POST` 至後端 → 後端 console 印出三項資料。

---

## 1. 技術棧約束（硬性，不得替換）

| 層   | 技術                                                | 禁止                                                  |
| ---- | --------------------------------------------------- | ----------------------------------------------------- |
| 前端 | 純 HTML + Vanilla JS，CDN 引入 SDK                  | 不得用 React/Vue/框架、不得引入打包器（Vite/webpack） |
| 掃描 | `liff.scanCodeV2()`（首選）+ `html5-qrcode`（備援） | 不得只實作單一方式                                    |
| 後端 | FastAPI + Pydantic + Uvicorn                        | 不得用 Flask、不得手刻 body 驗證                      |

CDN：

- LIFF：`https://static.line-scdn.net/liff/edge/2/sdk.js`
- html5-qrcode：`https://unpkg.com/html5-qrcode`

---

## 2. 全域規則（agent 必須遵守）

1. **HTTPS 強制**：LIFF 與 `getUserMedia` 皆需 secure context。本機請用 ngrok / mkcert，勿假設 `http://localhost` 可掃相機。
2. **不硬編機密**：`LIFF_ID`、`API_BASE` 集中於檔案頂端 `CONFIG` 區塊，並用醒目佔位字串（如 `'YOUR_LIFF_ID'`），不要塞進邏輯深處。
3. **`scanCodeV2()` 需登入**：`liff.init` 後若 `!liff.isLoggedIn()`，先 `liff.login({ redirectUri })` 並 return。
4. **降級要自動**：方式一任何 reject（環境不支援 / 使用者取消 / 未授權）都必須 `catch` 並自動切換方式二，不可讓使用者卡死。
5. **欄位命名對接**：前端送 **camelCase**（`userId`/`displayName`/`qrValue`），後端 Pydantic 用 **snake_case** + `Field(alias=...)`。兩邊不得各寫各的。
6. **CORS 必開**：後端加 `CORSMiddleware`，開發期 `allow_origins=["*"]`，並在程式碼註解標明「正式環境收斂白名單」。
7. **安全備註（本次不實作，但要留註解）**：`userId` 由前端傳來可偽造；若需信任身分，改用 `liff.getIDToken()` 後端驗證。於後端 handler 上方留 `# SECURITY:` 註解點出此事。

---

## 3. 前置作業（人工，agent 無法代做 → 產出時明確提示使用者）

於 LINE Developers Console → 目標 Channel → LIFF 分頁設定，並在 README 或終端輸出提醒：

| 設定         | 值              | 原因                                     |
| ------------ | --------------- | ---------------------------------------- |
| Endpoint URL | 你的 HTTPS 網址 | LIFF 與相機需 secure context             |
| Size         | **Full**        | iOS 的 `scanCodeV2()` 僅在 Full 尺寸可用 |
| Scan QR      | **開啟**        | 否則 `scanCodeV2()` 無法啟動             |
| Scope        | 勾 `profile`    | `getProfile()` 讀 name 所需              |

> 環境限制（決定為何要備援）：`scanCodeV2()` 在 **PC 的 LIFF browser 不支援**、**iOS 需 14.3 以上且限 Full 尺寸**；外部瀏覽器需支援 WebRTC。html5-qrcode 走標準 `getUserMedia`，補上這些死角。

---

## 4. 最終檔案結構

```
project/
├── frontend/
│   ├── index.html
│   └── liff-app.js
├── backend/
│   ├── main.py
│   └── requirements.txt
└── README.md          # 啟動步驟 + 前置提醒
```

---

## 5. 分階段任務（依序，每階段可獨立驗收）

### 階段 A — 後端骨架

- 目的：先有可接收的 API，前端才好驗。
- 產出：`backend/main.py`、`requirements.txt`。
- 驗收：`uvicorn main:app --reload` 啟動；用 `curl` POST 假資料，終端印出 `[SCAN] user_id=... name=... qr_value=...`，回傳 `{"ok": true}`。

### 階段 B — LIFF 身分

- 目的：需求 1-1。
- 產出：`index.html` 骨架 + `liff-app.js` 的 `init()`。
- 驗收：於 LINE 開啟 LIFF，畫面顯示真實 `userId` 與 `displayName`。

### 階段 C — 雙掃描

- 目的：需求 1-2、需求 2。
- 產出：`scanWithLiff()`、`scanWithHtml()`、共用 `onScanned()`。
- 驗收：LINE 內按方式一可掃；PC 瀏覽器按方式二可掃；方式一在不支援環境會自動降級到方式二；掃到的值顯示於畫面。

### 階段 D — 送出串接

- 目的：需求 3、需求 4。
- 產出：`submit()` + 後端聯調。
- 驗收：按「送出」後，後端終端印出正確三項資料，前端顯示「送出成功」。

---

## 6. 逐檔規格

### 6-1. `backend/requirements.txt`

```
fastapi
uvicorn[standard]
```

### 6-2. `backend/main.py`（參考實作，可照抄）

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # TODO 正式環境收斂為 LIFF 網域白名單
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class ScanPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = Field(alias="userId")
    display_name: str = Field(alias="displayName")
    qr_value: str = Field(alias="qrValue")


@app.post("/scan")
# SECURITY: user_id 由前端傳來可偽造；需信任身分時改用 liff.getIDToken() 後端驗證。
async def receive_scan(payload: ScanPayload):
    print(
        f"[SCAN] user_id={payload.user_id} "
        f"name={payload.display_name} "
        f"qr_value={payload.qr_value}"
    )
    return {"ok": True}
```

### 6-3. `frontend/index.html`（結構規格）

必含元素與 `id`：

- 身分顯示：`#userId`、`#displayName`
- 兩顆掃描鈕：`#scanLiffBtn`、`#scanHtmlBtn`
- html5-qrcode 掛載點：`#reader`（預設 `hidden`）
- QR 值顯示：`#qrValue`
- 送出鈕：`#submitBtn`（預設 `disabled`）
- 狀態列：`#status`
- 於 `<head>` 依序引入 LIFF SDK、html5-qrcode，最後引入 `./liff-app.js`。

### 6-4. `frontend/liff-app.js`（參考實作，可照抄）

```javascript
// ====== CONFIG（填這裡）======
const LIFF_ID = "YOUR_LIFF_ID";
const API_BASE = "https://your-api.host";

// ====== 狀態 ======
const state = { userId: "", displayName: "", qrValue: "" };

// ====== DOM ======
const el = {
  userId: document.getElementById("userId"),
  displayName: document.getElementById("displayName"),
  qrValue: document.getElementById("qrValue"),
  reader: document.getElementById("reader"),
  scanLiffBtn: document.getElementById("scanLiffBtn"),
  scanHtmlBtn: document.getElementById("scanHtmlBtn"),
  submitBtn: document.getElementById("submitBtn"),
  status: document.getElementById("status"),
};

// ====== 初始化 + Profile（需求 1-1）======
async function init() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }
    const profile = await liff.getProfile();
    state.userId = profile.userId;
    state.displayName = profile.displayName;
    el.userId.textContent = state.userId;
    el.displayName.textContent = state.displayName;
  } catch (err) {
    el.status.textContent = `LIFF 初始化失敗：${err.message}`;
  }
}

// ====== 掃描成功共用（需求 2）======
function onScanned(value) {
  state.qrValue = value;
  el.qrValue.textContent = value;
  el.submitBtn.disabled = false;
}

// ====== 方式一：LIFF 原生 ======
async function scanWithLiff() {
  try {
    const result = await liff.scanCodeV2();
    if (result && result.value) onScanned(result.value);
  } catch (err) {
    el.status.textContent = "原生掃描不可用，改用相機掃描";
    await scanWithHtml(); // 規則 4：自動降級
  }
}

// ====== 方式二：html5-qrcode 備援 ======
let html5QrCode = null;
async function scanWithHtml() {
  el.reader.hidden = false;
  html5QrCode = new Html5Qrcode("reader");
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        stopHtmlScanner();
        onScanned(decodedText);
      },
      () => {}, // 單幀解析失敗略過
    );
  } catch (err) {
    el.status.textContent = `相機啟動失敗：${err.message}`;
    el.reader.hidden = true;
  }
}
function stopHtmlScanner() {
  if (!html5QrCode) return;
  html5QrCode.stop().then(() => {
    html5QrCode.clear();
    el.reader.hidden = true;
    html5QrCode = null;
  });
}

// ====== 送出（需求 3）======
async function submit() {
  if (!state.qrValue) return;
  el.submitBtn.disabled = true;
  el.status.textContent = "送出中…";
  try {
    const res = await fetch(`${API_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: state.userId,
        displayName: state.displayName,
        qrValue: state.qrValue,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.status.textContent = "送出成功";
  } catch (err) {
    el.status.textContent = `送出失敗：${err.message}`;
    el.submitBtn.disabled = false;
  }
}

// ====== 綁定 ======
el.scanLiffBtn.addEventListener("click", scanWithLiff);
el.scanHtmlBtn.addEventListener("click", scanWithHtml);
el.submitBtn.addEventListener("click", submit);
init();
```

---

## 7. 本機執行與驗收指令

```bash
# 後端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 前端（另一終端）
cd frontend
python -m http.server 5173

# HTTPS 對外（另一終端；LIFF/相機必需）
ngrok http 5173
# 將 ngrok HTTPS 網址填入 LIFF Console 的 Endpoint URL
# 將 LIFF_ID、API_BASE 填入 liff-app.js
```

後端驗證（不經前端）：

```bash
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"userId":"U123","displayName":"Lobinda","qrValue":"HELLO"}'
# 預期：終端印出 [SCAN] user_id=U123 name=Lobinda qr_value=HELLO
```

---

## 8. 完成定義（Definition of Done）

- [ ] 於 LINE 開啟 LIFF，畫面顯示真實 `userId` 與 `displayName`
- [ ] 方式一（`scanCodeV2`）在 LINE 內可掃並顯示值
- [ ] 方式二（`html5-qrcode`）在 PC/一般瀏覽器可掃並顯示值
- [ ] 方式一於不支援環境會自動降級方式二（可斷網或改壞 LIFF_ID 模擬）
- [ ] 缺欄位的 POST 被後端回 `422`（Pydantic 自動）
- [ ] 正常 POST → 後端終端印出三項資料、前端顯示「送出成功」
- [ ] `LIFF_ID` / `API_BASE` 為醒目佔位、未硬編於邏輯中
- [ ] `# SECURITY:` 註解存在於後端 handler

---

## 9. Kickoff Prompt（貼給 coding agent 起手用）

> 依附件 `SPEC.md` 建置專案。請嚴格遵守 §1 技術棧約束與 §2 全域規則，依 §5 階段順序實作，每完成一階段就依該階段驗收條件自我檢查再往下。前端只用 CDN、不引入打包器；後端用 FastAPI + Pydantic alias 對接 camelCase。完成後對照 §8 逐項確認，並在 README 標明 §3 需人工於 LINE Console 設定的項目（Scan QR 開啟、Size=Full、scope=profile、Endpoint 填 HTTPS）。
