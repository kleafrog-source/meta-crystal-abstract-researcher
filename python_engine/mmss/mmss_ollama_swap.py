#!/usr/bin/env python3
"""
MMSS Ollama-swap — pluggable encoder и teacher как готовые callable с заглушкой-контрактом.

Контракт:
  class Encoder:  __call__(text: str, dim: int) -> torch.Tensor[dim]
  class Teacher:  __call__(query: str) -> torch.Tensor[inv_dim]   # ideal invariant

Реализации:
  - FeatureHashEncoder  (fallback, офлайн)
  - SyntheticTeacher    (fallback, LLM-teacher-compatible цикл)
  - OllamaEncoder       (реальный HTTP-клиент к Ollama /api/embed + /api/embeddings)
  - OllamaTeacher       (реальный HTTP-клиент к Ollama /api/chat, structured JSON)

Автодетект: detect_ollama() пингует /api/tags. Если Ollama недоступен —
 graceful fallback к feature-hash / synthetic с пометкой mode.
make_encoder()/make_teacher() возвращают (callable, mode).

Этот модуль НЕ требует Ollama для импорта/теста: fallback работает офлайн.
Локально у пользователя: достаточно поднять Ollama с моделью эмбеддингов
(напр. `ollama pull bge-small-en` или `nomic-embed-text`) и чат-моделью
(напр. `ollama pull qwen2.5:7b`) — swap автоматический.
"""

import json
import re
import urllib.request
import urllib.error
from typing import Optional

import torch

from mmss_v22_core import _hash_to_vector
from mmss_distill_isomorphism import teacher_invariant as _synthetic_teacher_invariant, DOMAINS


# ---------------------------------------------------------------------------
# Контракты (абстрактные)
# ---------------------------------------------------------------------------
class Encoder:
    """Контракт энкодера: text -> плотный вектор z_q[dim]."""
    def __call__(self, text: str, dim: int) -> torch.Tensor:
        raise NotImplementedError


class Teacher:
    """Контракт учителя: query -> ideal invariant вектор[inv_dim]."""
    def __call__(self, query: str) -> torch.Tensor:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Fallback реализации (офлайн)
# ---------------------------------------------------------------------------
class FeatureHashEncoder(Encoder):
    mode = "fallback_feature_hash"

    def __call__(self, text: str, dim: int) -> torch.Tensor:
        return _hash_to_vector(text, dim)


class SyntheticTeacher(Teacher):
    """LLM-teacher-compatible заглушка: валидирует цикл, не реальная семантика."""
    mode = "fallback_synthetic"

    def __call__(self, query: str) -> torch.Tensor:
        return _synthetic_teacher_invariant(query)


# ---------------------------------------------------------------------------
# Ollama клиент (реальный)
# ---------------------------------------------------------------------------
# Выровнено под репозиторий meta-crystal-abstract-researcher (src/lib/llm/ollama.ts):
DEFAULT_EMBED_MODEL = "embeddinggemma:300m"   # bge-small-en / nomic-embed-text / mxbai-embed-large
DEFAULT_CHAT_MODEL = "qwen2.5-3b"             # qwen2.5:7b / llama3.1 / phi3


def _post_json(url: str, payload: dict, timeout: float = 30.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def detect_ollama(host: str = "http://localhost:11434", timeout: float = 2.0) -> bool:
    """Пинг /api/tags. True если Ollama отвечает."""
    try:
        req = urllib.request.Request(host.rstrip("/") + "/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
            return isinstance(data, dict) and "models" in data
    except Exception:
        return False


class OllamaEncoder(Encoder):
    """Реальный Ollama-энкодер. GET embeddings -> проекция в dim (детерминированная)."""
    mode = "ollama_real"

    def __init__(self, host: str = "http://localhost:11434",
                 model: str = DEFAULT_EMBED_MODEL, target_dim: int = 64, timeout: float = 30.0):
        self.host = host.rstrip("/")
        self.model = model
        self.target_dim = target_dim
        self.timeout = timeout
        # детерминированная проекция model_dim -> target_dim (seeded)
        g = torch.Generator().manual_seed(2024)
        self._proj = None  # лениво: узнаём model_dim при первом вызове

    def _embed(self, text: str) -> torch.Tensor:
        # /api/embed (новый) или /api/embeddings (старый)
        try:
            res = _post_json(self.host + "/api/embed",
                             {"model": self.model, "input": text}, timeout=self.timeout)
            emb = res["embeddings"][0]
        except (urllib.error.URLError, KeyError, json.JSONDecodeError):
            res = _post_json(self.host + "/api/embeddings",
                             {"model": self.model, "prompt": text}, timeout=self.timeout)
            emb = res["embedding"]
        return torch.tensor(emb, dtype=torch.float32)

    def _project(self, v: torch.Tensor) -> torch.Tensor:
        if v.numel() == self.target_dim:
            return v
        if self._proj is None or self._proj.shape[1] != v.numel():
            g = torch.Generator().manual_seed(2024)
            self._proj = torch.randn(self.target_dim, v.numel(), generator=g) \
                / (v.numel() ** 0.5)
        out = self._proj @ v
        n = out.norm()
        return out / n if n > 0 else out

    def __call__(self, text: str, dim: int) -> torch.Tensor:
        v = self._embed(text)
        return self._project(v)


class OllamaTeacher(Teacher):
    """Реальный LLM-учитель через Ollama: просит JSON-инвариант по схеме доменов."""
    mode = "ollama_real"

    INV_DIM = 8

    def __init__(self, host: str = "http://localhost:11434",
                 model: str = DEFAULT_CHAT_MODEL, timeout: float = 60.0):
        self.host = host.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.system = (
            "You are an invariant-extraction engine. Given a query, output ONLY a JSON "
            f"object {{\"invariant\": [8 floats in -1..1]}} representing the abstract "
            f"invariant features of the query across these domain axes: {DOMAINS}. "
            "No prose, no markdown, only the JSON object."
        )

    @staticmethod
    def _extract_json(content: str) -> dict:
        text = content.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            text = text.strip()
        try:
            return json.loads(text)
        except Exception:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                raise
            return json.loads(match.group(0))

    def _normalize_invariant(self, inv) -> torch.Tensor:
        values = [float(x) for x in inv]
        if len(values) < self.INV_DIM:
            values.extend([0.0] * (self.INV_DIM - len(values)))
        elif len(values) > self.INV_DIM:
            values = values[: self.INV_DIM]
        t = torch.tensor(values, dtype=torch.float32).clamp(-1.0, 1.0)
        n = t.norm()
        return t / n if n > 0 else t

    def __call__(self, query: str) -> torch.Tensor:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.system},
                {"role": "user", "content": query},
            ],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2},
        }
        res = _post_json(self.host + "/api/chat", payload, timeout=self.timeout)
        content = res["message"]["content"].strip()
        # парсинг JSON (Ollama format=json обычно даёт чистый JSON)
        try:
            obj = self._extract_json(content)
            inv = obj["invariant"]
            return self._normalize_invariant(inv)
        except Exception:
            # fallback к синтетическому учителю если LLM ответ невалиден
            return _synthetic_teacher_invariant(query)


# ---------------------------------------------------------------------------
# Фабрики с автодетектом
# ---------------------------------------------------------------------------
def make_encoder(prefer_ollama: bool = True, host: str = "http://localhost:11434",
                 model: str = DEFAULT_EMBED_MODEL, target_dim: int = 64, timeout: float = 30.0) -> tuple:
    """Возвращает (encoder, mode). Если prefer_ollama и Ollama доступен — реальный."""
    if prefer_ollama and detect_ollama(host):
        try:
            enc = OllamaEncoder(host, model, target_dim, timeout)
            # smoke-test
            _ = enc("ping", target_dim)
            return enc, "ollama_real"
        except Exception:
            pass
    return FeatureHashEncoder(), "fallback_feature_hash"


def make_teacher(prefer_ollama: bool = True, host: str = "http://localhost:11434",
                 model: str = DEFAULT_CHAT_MODEL, timeout: float = 60.0) -> tuple:
    if prefer_ollama and detect_ollama(host):
        try:
            t = OllamaTeacher(host, model, timeout)
            _ = t("ping")  # smoke-test (может упасть в fallback внутри)
            return t, "ollama_real"
        except Exception:
            pass
    return SyntheticTeacher(), "fallback_synthetic"


# ---------------------------------------------------------------------------
# self-test (офлайн, должен показать fallback)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    host = "http://localhost:11434"
    up = detect_ollama(host)
    print(f"Ollama at {host}: {'UP' if up else 'not reachable (fallback)'}")
    enc, emode = make_encoder(prefer_ollama=True, host=host, target_dim=64)
    tea, tmode = make_teacher(prefer_ollama=True, host=host)
    print(f"encoder mode: {emode}  | teacher mode: {tmode}")
    z = enc("quantum fractal topology invariant", 64)
    inv = tea("quantum fractal topology invariant")
    print(f"z_q: dim={z.numel()} norm={z.norm():.4f}")
    print(f"ideal invariant: {inv.tolist()}")
    print("\nКонтракт готов к локальному swap: подними Ollama с моделями и перезапусти —")
    print(f"encoder/teacher автоматически переключатся на ollama_real (mode в отчёте).")
