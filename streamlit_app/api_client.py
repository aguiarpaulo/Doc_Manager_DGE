"""Thin HTTP client the Streamlit UI uses to talk to the GED API."""

import os

import requests

BASE_URL = os.environ.get("GED_API_URL", "http://localhost:8000")
TIMEOUT = 30


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(email: str, password: str, mfa_code: str | None = None) -> dict:
    payload = {"email": email, "password": password}
    if mfa_code:
        payload["mfa_code"] = mfa_code
    resp = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def search_documents(token: str, **filters) -> list[dict]:
    params = {k: v for k, v in filters.items() if v}
    resp = requests.get(
        f"{BASE_URL}/documents", headers=_auth(token), params=params, timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def list_obras(token: str) -> list[dict]:
    resp = requests.get(f"{BASE_URL}/obras", headers=_auth(token), timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def create_document(token: str, nome: str, obra_id: str, categoria: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/documents",
        headers=_auth(token),
        json={"nome": nome, "obra_id": obra_id, "categoria": categoria},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def upload_version(token: str, document_id: str, filename: str, data: bytes, content_type: str):
    resp = requests.post(
        f"{BASE_URL}/documents/{document_id}/versions",
        headers=_auth(token),
        files={"file": (filename, data, content_type)},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def transition(token: str, document_id: str, action: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/documents/{document_id}/{action}", headers=_auth(token), timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def history(token: str, document_id: str) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/documents/{document_id}/history", headers=_auth(token), timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()
