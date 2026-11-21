#!/usr/bin/env python
"""Loopback-only sentence embedding service for CampusConnect."""

from __future__ import annotations

import argparse
import hmac
import json
import math
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

import torch
from transformers import AutoModel, AutoTokenizer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
VECTOR_DIMENSIONS = 384
MAX_BATCH_SIZE = 32
MAX_TEXT_LENGTH = 20_000
MAX_REQUEST_BYTES = 700_000


def mean_pool_and_normalize(
    token_embeddings: torch.Tensor, attention_mask: torch.Tensor
) -> torch.Tensor:
    expanded_mask = attention_mask.unsqueeze(-1).expand_as(token_embeddings)
    weights = expanded_mask.to(dtype=token_embeddings.dtype)
    sums = torch.sum(token_embeddings * weights, dim=1)
    counts = torch.clamp(weights.sum(dim=1), min=1e-9)
    return torch.nn.functional.normalize(sums / counts, p=2, dim=1)


def validate_texts(value: Any) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_BATCH_SIZE:
        raise ValueError("texts must be a non-empty array of at most 32 strings")

    texts: list[str] = []
    for text in value:
        if (
            not isinstance(text, str)
            or not text.strip()
            or len(text) > MAX_TEXT_LENGTH
            or any(ord(character) < 32 and character not in "\t\n\r" for character in text)
        ):
            raise ValueError("each text must be non-empty and at most 20000 characters")
        texts.append(text)
    return texts


class EmbeddingEngine:
    def __init__(self, tokenizer: Any, model: Any) -> None:
        self.tokenizer = tokenizer
        self.model = model
        self.model.eval()
        self._lock = threading.Lock()

    @classmethod
    def load(cls) -> "EmbeddingEngine":
        cpu_threads = max(1, min(4, os.cpu_count() or 1))
        torch.set_num_threads(cpu_threads)
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME, revision=MODEL_REVISION
        )
        model = AutoModel.from_pretrained(MODEL_NAME, revision=MODEL_REVISION)
        return cls(tokenizer, model)

    def encode(self, texts: list[str]) -> list[list[float]]:
        valid_texts = validate_texts(texts)
        tokens = self.tokenizer(
            valid_texts,
            padding=True,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        )

        with self._lock, torch.inference_mode():
            output = self.model(**tokens)
            pooled = mean_pool_and_normalize(
                output.last_hidden_state, tokens["attention_mask"]
            )

        if pooled.ndim != 2 or pooled.shape != (len(valid_texts), VECTOR_DIMENSIONS):
            raise ValueError("loaded model returned an unexpected embedding shape")

        vectors = pooled.cpu().tolist()
        if any(
            len(vector) != VECTOR_DIMENSIONS
            or not all(math.isfinite(component) for component in vector)
            for vector in vectors
        ):
            raise ValueError("loaded model returned invalid vector values")
        return vectors


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != VECTOR_DIMENSIONS or len(right) != VECTOR_DIMENSIONS:
        raise ValueError("cosine similarity requires two 384-dimensional vectors")
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


class SemanticRequestHandler(BaseHTTPRequestHandler):
    engine: EmbeddingEngine

    def _respond(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self._respond(404, {"error": "Not found."})
            return
        self._respond(
            200,
            {
                "ready": True,
                "model": MODEL_NAME,
                "revision": MODEL_REVISION,
                "dimensions": VECTOR_DIMENSIONS,
                "device": "cpu",
            },
        )

    def do_POST(self) -> None:
        if self.path != "/embed":
            self._respond(404, {"error": "Not found."})
            return

        required_token = os.environ.get("SEMANTIC_EMBEDDING_TOKEN", "").strip()
        if required_token and not hmac.compare_digest(
            self.headers.get("Authorization", ""),
            f"Bearer {required_token}",
        ):
            self._respond(401, {"error": "Unauthorized."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._respond(400, {"error": "Invalid content length."})
            return
        if length < 1 or length > MAX_REQUEST_BYTES:
            self._respond(413, {"error": "Request body is too large or empty."})
            return

        try:
            request = json.loads(self.rfile.read(length))
            texts = validate_texts(request.get("texts") if isinstance(request, dict) else None)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._respond(400, {"error": "Invalid embedding request."})
            return
        except Exception:
            self._respond(400, {"error": "Invalid embedding request."})
            return

        try:
            vectors = self.engine.encode(texts)
        except Exception:
            self._respond(503, {"error": "Embedding generation is unavailable."})
            return

        self._respond(
            200,
            {
                "model": MODEL_NAME,
                "revision": MODEL_REVISION,
                "dimensions": VECTOR_DIMENSIONS,
                "embeddings": vectors,
            },
        )

    def log_message(self, format: str, *args: Any) -> None:
        print("semantic-embedding-service:", format % args)


def run_demo(engine: EmbeddingEngine) -> None:
    texts = [
        "Backend software internship building Python APIs with PostgreSQL.",
        "Server-side development internship creating REST services in Python and PostgreSQL.",
        "Graphic design internship creating brand identities and marketing artwork.",
    ]
    vectors = engine.encode(texts)
    print(
        json.dumps(
            {
                "model": MODEL_NAME,
                "revision": MODEL_REVISION,
                "dimensions": len(vectors[0]),
                "cosineSimilarity": {
                    "query_to_related_opportunity": round(
                        cosine_similarity(vectors[0], vectors[1]), 6
                    ),
                    "query_to_unrelated_opportunity": round(
                        cosine_similarity(vectors[0], vectors[2]), 6
                    ),
                },
            },
            indent=2,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="embed a small sample and exit")
    arguments = parser.parse_args()

    print(f"Loading {MODEL_NAME} on CPU; the first run may download model files.")
    engine = EmbeddingEngine.load()
    if arguments.demo:
        run_demo(engine)
        return

    SemanticRequestHandler.engine = engine
    host = os.environ.get("SEMANTIC_EMBEDDING_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost"} and not os.environ.get(
        "SEMANTIC_EMBEDDING_TOKEN", ""
    ).strip():
        raise RuntimeError(
            "A non-loopback embedding service requires SEMANTIC_EMBEDDING_TOKEN."
        )

    server = ThreadingHTTPServer(
        (host, int(os.environ.get("SEMANTIC_EMBEDDING_PORT", "8008"))),
        SemanticRequestHandler,
    )
    print(
        f"Ready on http://127.0.0.1:{server.server_port}; "
        "model remains loaded until the service stops."
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
