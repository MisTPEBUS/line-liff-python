import json
import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints


load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development")
APP_HOST = os.getenv("APP_HOST", "127.0.0.1")
APP_PORT = int(os.getenv("APP_PORT", "8000"))


def parse_frontend_origins(value: str) -> list[str]:
    """將逗號分隔的環境變數轉換成 CORS origin 清單。"""
    return [origin.strip() for origin in value.split(",") if origin.strip()]


frontend_origins = parse_frontend_origins(
    os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500",
    )
)

app = FastAPI(
    title="LINE LIFF QR Code API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

NonBlankString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class QrCodeRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "lineUserId": "U123456789abcdef",
                "lineName": "王小明",
                "qrCodeValue": "BUS-QR-001",
            }
        },
    )

    line_user_id: NonBlankString = Field(alias="lineUserId")
    line_name: NonBlankString = Field(alias="lineName")
    qr_code_value: NonBlankString = Field(alias="qrCodeValue")


class ApiResponse(BaseModel):
    status: str
    message: str


class WebhookEvent(BaseModel):
    """允許 LINE 未來加入新欄位，避免非破壞性更新造成驗證失敗。"""

    model_config = ConfigDict(extra="allow")

    type: NonBlankString


class WebhookRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    destination: NonBlankString
    events: list[WebhookEvent]


@app.get("/", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def health_check() -> ApiResponse:
    return ApiResponse(status="success", message="LINE LIFF QR Code API")


@app.post(
    "/api/qrcode",
    response_model=ApiResponse,
    status_code=status.HTTP_200_OK,
)
async def receive_qr_code(payload: QrCodeRequest) -> ApiResponse:
    try:
        body = payload.model_dump(by_alias=True)
        print(f"POST /api/qrcode body: {json.dumps(body, ensure_ascii=False)}")

        return ApiResponse(status="success", message="資料接收成功")
    except Exception as error:
        print(f"POST /api/qrcode error message: {error}")
        raise


@app.post(
    "/webhook",
    response_model=ApiResponse,
    status_code=status.HTTP_200_OK,
)
async def receive_line_webhook(payload: WebhookRequest) -> ApiResponse:
    print("====================================")
    print("收到 LINE Webhook")
    print(f"Destination: {payload.destination}")
    print(f"Event Count: {len(payload.events)}")

    for index, event in enumerate(payload.events, start=1):
        event_data = event.model_dump(by_alias=True)
        print(f"Event {index}: {json.dumps(event_data, ensure_ascii=False)}")

    print("====================================")

    return ApiResponse(status="success", message="Webhook 接收成功")

