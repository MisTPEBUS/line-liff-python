"use strict";

const LIFF_ID = window.APP_CONFIG.LIFF_ID;
const API_URL = window.APP_CONFIG.API_URL;

const state = {
  lineUserId: "",
  lineName: "",
  qrCodeValue: "",
};

let html5QrCode = null;
let isHtmlScannerRunning = false;
let isQrCodeDetected = false;
let barcodeDetector = null;
let barcodeDetectionTimer = null;

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
      withLoginOnExternalBrowser: true,
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
    showMessage(
      "LINE LIFF 初始化失敗，請確認設定並從 LINE 重新開啟頁面。",
      true,
    );
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
      showMessage(
        "目前環境不支援 LIFF QR Code 掃描，請改用 HTML Camera。",
        true,
      );
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
    // 開啟相機不應清除上一次結果；LIFF WebView 重繪後也從 state 恢復顯示。
    renderQrCodeValue();

    if (typeof Html5Qrcode === "undefined") {
      throw new Error("html5-qrcode SDK 尚未載入");
    }

    if (!window.isSecureContext) {
      throw new Error("相機只能在 HTTPS 安全連線中使用");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("目前瀏覽器不支援相機存取");
    }

    const readerElement = document.querySelector("#reader");
    readerElement.classList.add("is-scanning");
    isQrCodeDetected = false;

    const cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) {
      throw new DOMException("找不到可用的相機鏡頭", "NotFoundError");
    }

    const preferredCamera = getPreferredCamera(cameras);
    html5QrCode = new Html5Qrcode("reader", {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
    });
    isHtmlScannerRunning = true;
    updateScannerButtons();

    await html5QrCode.start(
      preferredCamera.id,
      {
        fps: 15,
        aspectRatio: 1.333334,
      },
      handleHtmlQrCodeDetected,
      () => {
        // 每一幀未辨識到 QR Code 是正常情況，不輸出 console error。
      },
    );

    await enableContinuousAutoFocus();
    await startQrPositionTracking(readerElement);
    showMessage("相機已啟動，請將 QR Code 對準掃描框。", false);
    renderQrCodeValue();
    readerElement.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    console.error("HTML Camera 啟動失敗：", error);
    isHtmlScannerRunning = false;
    document.querySelector("#reader").classList.remove("is-scanning");
    await clearHtmlScanner();
    updateScannerButtons();
    showMessage(getCameraErrorMessage(error), true);
  }
}

async function handleHtmlQrCodeDetected(decodedText) {
  if (isQrCodeDetected) {
    return;
  }

  const qrCodeValue = String(decodedText).trim();
  if (!qrCodeValue) {
    return;
  }

  isQrCodeDetected = true;
  showFallbackDetectedFrame();
  showMessage("已偵測到 QR Code，正在關閉相機...", false);

  await delay(250);
  await stopHtmlScanner(false);
  setQrCodeValue(qrCodeValue);
}

async function enableContinuousAutoFocus() {
  try {
    const capabilities = html5QrCode.getRunningTrackCapabilities();
    const focusModes = capabilities.focusMode;

    if (Array.isArray(focusModes) && focusModes.includes("continuous")) {
      await html5QrCode.applyVideoConstraints({
        advanced: [{ focusMode: "continuous" }],
      });
    }
  } catch (error) {
    // 部分 iOS/LINE WebView 不提供 focusMode，維持裝置預設自動對焦即可。
    console.info("目前裝置不支援手動設定連續對焦：", error);
  }
}

async function startQrPositionTracking(readerElement) {
  if (!("BarcodeDetector" in window)) {
    return;
  }

  try {
    const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
    if (!supportedFormats.includes("qr_code")) {
      return;
    }

    barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
    scheduleBarcodeDetection(readerElement);
  } catch (error) {
    barcodeDetector = null;
    console.info("原生 QR Code 定位不可用，改用 html5-qrcode：", error);
  }
}

function scheduleBarcodeDetection(readerElement) {
  clearTimeout(barcodeDetectionTimer);
  barcodeDetectionTimer = setTimeout(
    () => detectQrCodePosition(readerElement),
    100,
  );
}

async function detectQrCodePosition(readerElement) {
  if (!barcodeDetector || !isHtmlScannerRunning || isQrCodeDetected) {
    return;
  }

  const video = readerElement.querySelector("video");
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleBarcodeDetection(readerElement);
    return;
  }

  try {
    const detectedCodes = await barcodeDetector.detect(video);
    const qrCode = detectedCodes.find((code) => code.rawValue);

    if (qrCode) {
      drawQrCodeOutline(readerElement, video, qrCode.cornerPoints);
      await handleHtmlQrCodeDetected(qrCode.rawValue);
      return;
    }
  } catch (error) {
    console.info("QR Code 位置偵測暫時失敗：", error);
  }

  scheduleBarcodeDetection(readerElement);
}

function drawQrCodeOutline(readerElement, video, cornerPoints) {
  if (!Array.isArray(cornerPoints) || cornerPoints.length < 4) {
    showFallbackDetectedFrame();
    return;
  }

  removeQrCodeOutline();

  const readerRect = readerElement.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const scale = Math.max(
    videoRect.width / video.videoWidth,
    videoRect.height / video.videoHeight,
  );
  const renderedWidth = video.videoWidth * scale;
  const renderedHeight = video.videoHeight * scale;
  const cropX = (renderedWidth - videoRect.width) / 2;
  const cropY = (renderedHeight - videoRect.height) / 2;
  const offsetX = videoRect.left - readerRect.left;
  const offsetY = videoRect.top - readerRect.top;

  const points = cornerPoints
    .map((point) => {
      const x = offsetX + point.x * scale - cropX;
      const y = offsetY + point.y * scale - cropY;
      return `${x},${y}`;
    })
    .join(" ");

  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.id = "qr-detection-overlay";
  overlay.setAttribute("viewBox", `0 0 ${readerRect.width} ${readerRect.height}`);

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", points);
  overlay.appendChild(polygon);
  readerElement.appendChild(overlay);
}

function showFallbackDetectedFrame() {
  document.querySelector("#reader").classList.add("is-detected");
}

function removeQrCodeOutline() {
  document.querySelector("#qr-detection-overlay")?.remove();
  document.querySelector("#reader")?.classList.remove("is-detected");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getPreferredCamera(cameras) {
  const rearCameraPattern = /back|rear|environment|後|背面/i;
  return (
    cameras.find((camera) => rearCameraPattern.test(camera.label)) ||
    cameras[cameras.length - 1]
  );
}

function getCameraErrorMessage(error) {
  const errorName = error && typeof error === "object" ? error.name : "";
  const errorMessage =
    error instanceof Error ? error.message : String(error || "未知錯誤");

  if (
    errorName === "NotAllowedError" ||
    errorName === "PermissionDeniedError"
  ) {
    return "無法啟動相機：相機權限被拒絕，請到手機設定允許 LINE 或瀏覽器使用相機。";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "無法啟動相機：找不到可用的相機鏡頭。";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "無法啟動相機：鏡頭可能正被其他 App 使用，請關閉其他相機程式後重試。";
  }

  if (
    errorName === "OverconstrainedError" ||
    errorName === "ConstraintNotSatisfiedError"
  ) {
    return "無法啟動後置鏡頭：目前裝置不支援要求的相機設定。";
  }

  return `無法啟動相機：${errorMessage}`;
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
  clearTimeout(barcodeDetectionTimer);
  barcodeDetectionTimer = null;
  barcodeDetector = null;
  removeQrCodeOutline();

  if (!html5QrCode) {
    return;
  }

  try {
    await html5QrCode.clear();
  } catch (error) {
    console.error("清除 HTML Camera 資源失敗：", error);
  } finally {
    html5QrCode = null;
    document.querySelector("#reader").classList.remove("is-scanning");
  }
}

function updateScannerButtons() {
  elements.scanCameraButton.disabled = isHtmlScannerRunning;
  elements.stopCameraButton.disabled = !isHtmlScannerRunning;
}

function setQrCodeValue(value) {
  state.qrCodeValue = String(value).trim();
  renderQrCodeValue();
  showMessage(
    state.qrCodeValue ? "QR Code 掃描成功。" : "未讀取到 QR Code 內容。",
    !state.qrCodeValue,
  );
}

function renderQrCodeValue() {
  elements.qrCodeValue.textContent = state.qrCodeValue || "尚未掃描";
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
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        lineUserId: state.lineUserId,
        lineName: state.lineName,
        qrCodeValue: state.qrCodeValue,
      }),
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
      const httpError = new Error(
        `API Request failed: ${response.status} ${response.statusText}`,
      );
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
