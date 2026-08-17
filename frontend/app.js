"use strict";

const LIFF_ID = window.APP_CONFIG.LIFF_ID;
const API_URL = window.APP_CONFIG.API_URL;

const state = {
  lineUserId: "",
  lineName: "",
  qrCodeValue: ""
};

let html5QrCode = null;
let isHtmlScannerRunning = false;

const elements = {};

async function init() {
  elements.lineUserId = document.querySelector("#line-user-id");
  elements.lineName = document.querySelector("#line-name");
  elements.qrCodeValue = document.querySelector("#qr-code-value");
  elements.scanLiffButton = document.querySelector("#scan-liff-button");
  elements.scanCameraButton = document.querySelector("#scan-camera-button");
  elements.stopCameraButton = document.querySelector("#stop-camera-button");
  elements.submitButton = document.querySelector("#submit-button");
  elements.message = document.querySelector("#message");

  bindEvents();
  await initLiff();
}

function bindEvents() {
  elements.scanLiffButton.addEventListener("click", scanWithLiff);
  elements.scanCameraButton.addEventListener("click", scanWithHtmlCamera);
  elements.stopCameraButton.addEventListener("click", stopHtmlScanner);
  elements.submitButton.addEventListener("click", submitData);
}

async function initLiff() {
  try {
    if (!LIFF_ID || LIFF_ID === "YOUR_LIFF_ID") {
      throw new Error("尚未在 config.js 設定有效的 LIFF_ID");
    }

    await liff.init({
      liffId: LIFF_ID,
      withLoginOnExternalBrowser: true
    });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    await loadLineProfile();
  } catch (error) {
    console.error("LIFF 初始化失敗：", error);
    elements.lineUserId.textContent = "取得失敗";
    elements.lineName.textContent = "取得失敗";
    showMessage("LINE LIFF 初始化失敗，請確認設定並從 LINE 重新開啟頁面。", true);
  }
}

async function loadLineProfile() {
  try {
    const profile = await liff.getProfile();
    state.lineUserId = profile.userId || "";
    state.lineName = profile.displayName || "";
    renderLineProfile();
  } catch (error) {
    console.error("取得 LINE Profile 失敗：", error);
    state.lineUserId = "";
    state.lineName = "";
    elements.lineUserId.textContent = "取得失敗";
    elements.lineName.textContent = "取得失敗";
    showMessage("無法取得 LINE 使用者資料，請確認已授權 profile 權限。", true);
  }
}

function renderLineProfile() {
  elements.lineUserId.textContent = state.lineUserId || "尚未取得";
  elements.lineName.textContent = state.lineName || "尚未取得";
}

async function scanWithLiff() {
  try {
    if (!liff.isApiAvailable("scanCodeV2")) {
      showMessage("目前環境不支援 LIFF QR Code 掃描，請改用 HTML Camera。", true);
      return;
    }

    const result = await liff.scanCodeV2();
    if (!result || !result.value) {
      showMessage("未讀取到 QR Code 內容。", true);
      return;
    }

    setQrCodeValue(result.value);
  } catch (error) {
    console.error("LIFF QR Scanner 發生錯誤：", error);
    showMessage("LIFF 掃描未完成，請再試一次或改用 HTML Camera。", true);
  }
}

async function scanWithHtmlCamera() {
  if (isHtmlScannerRunning) {
    showMessage("相機掃描器已經啟動。", true);
    return;
  }

  try {
    if (typeof Html5Qrcode === "undefined") {
      throw new Error("html5-qrcode SDK 尚未載入");
    }

    html5QrCode = new Html5Qrcode("reader");
    isHtmlScannerRunning = true;
    updateScannerButtons();

    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
          return { width: size, height: size };
        }
      },
      async (decodedText) => {
        setQrCodeValue(decodedText);
        await stopHtmlScanner(false);
      },
      () => {
        // 每一幀未辨識到 QR Code 是正常情況，不輸出 console error。
      }
    );

    showMessage("相機已啟動，請將 QR Code 對準掃描框。", false);
  } catch (error) {
    console.error("HTML Camera 啟動失敗：", error);
    isHtmlScannerRunning = false;
    await clearHtmlScanner();
    updateScannerButtons();
    showMessage("無法啟動相機，請確認瀏覽器權限與 HTTPS 連線。", true);
  }
}

async function stopHtmlScanner(showStoppedMessage = true) {
  try {
    if (html5QrCode && isHtmlScannerRunning) {
      await html5QrCode.stop();
    }
    isHtmlScannerRunning = false;
    await clearHtmlScanner();
    updateScannerButtons();

    if (showStoppedMessage) {
      showMessage("相機已停止。", false);
    }
  } catch (error) {
    console.error("停止 HTML Camera 失敗：", error);
    isHtmlScannerRunning = false;
    await clearHtmlScanner();
    updateScannerButtons();
    showMessage("停止相機時發生錯誤，請重新整理頁面。", true);
  }
}

async function clearHtmlScanner() {
  if (!html5QrCode) {
    return;
  }

  try {
    await html5QrCode.clear();
  } catch (error) {
    console.error("清除 HTML Camera 資源失敗：", error);
  } finally {
    html5QrCode = null;
  }
}

function updateScannerButtons() {
  elements.scanCameraButton.disabled = isHtmlScannerRunning;
  elements.stopCameraButton.disabled = !isHtmlScannerRunning;
}

function setQrCodeValue(value) {
  state.qrCodeValue = String(value).trim();
  elements.qrCodeValue.textContent = state.qrCodeValue || "尚未掃描";
  showMessage(state.qrCodeValue ? "QR Code 掃描成功。" : "未讀取到 QR Code 內容。", !state.qrCodeValue);
}

async function submitData() {
  if (!state.lineUserId) {
    showMessage("尚未取得 LINE User ID", true);
    return;
  }

  if (!state.lineName) {
    showMessage("尚未取得 LINE Name", true);
    return;
  }

  if (!state.qrCodeValue) {
    showMessage("請先掃描 QR Code", true);
    return;
  }

  setSubmitLoading(true);

  try {
    const baseUrl = API_URL.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/qrcode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lineUserId: state.lineUserId,
        lineName: state.lineName,
        qrCodeValue: state.qrCodeValue
      })
    });

    const responseText = await response.text();
    let responseData = {};

    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("API 回應不是有效 JSON：", parseError, responseText);
      }
    }

    if (!response.ok) {
      const httpError = new Error(`API Request failed: ${response.status} ${response.statusText}`);
      httpError.response = responseData || responseText;
      throw httpError;
    }

    showMessage(responseData.message || "資料接收成功", false);
  } catch (error) {
    console.error("API Request 失敗：", error);
    showMessage("資料送出失敗", true);
  } finally {
    setSubmitLoading(false);
  }
}

function setSubmitLoading(isLoading) {
  elements.submitButton.disabled = isLoading;
  elements.submitButton.textContent = isLoading ? "送出中..." : "送出資料";
}

function showMessage(message, isError) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", isError);
  elements.message.hidden = false;
}

window.addEventListener("DOMContentLoaded", init);
