import unittest
import json
import os
import threading
from types import SimpleNamespace
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import torch

from services.semantic_embedding_service import (
    EmbeddingEngine,
    MODEL_NAME,
    MODEL_REVISION,
    SemanticRequestHandler,
    VECTOR_DIMENSIONS,
    cosine_similarity,
    validate_texts,
)


class FakeTokenizer:
    def __call__(self, texts, **_kwargs):
        del _kwargs
        return {
            "input_ids": torch.ones((len(texts), 2), dtype=torch.long),
            "attention_mask": torch.ones((len(texts), 2), dtype=torch.long),
        }


class FakeModel:
    def eval(self):
        return self

    def __call__(self, input_ids, **_kwargs):
        del _kwargs
        batch, tokens = input_ids.shape
        values = torch.zeros((batch, tokens, VECTOR_DIMENSIONS), dtype=torch.float32)
        values[:, :, 0] = 1
        return SimpleNamespace(last_hidden_state=values)


class SemanticEmbeddingServiceTests(unittest.TestCase):
    def test_mock_model_emits_finite_normalized_384_dimensional_vectors(self):
        engine = EmbeddingEngine(FakeTokenizer(), FakeModel())
        vectors = engine.encode(["sample opportunity", "related role"])

        self.assertEqual(len(vectors), 2)
        for vector in vectors:
            self.assertEqual(len(vector), VECTOR_DIMENSIONS)
            self.assertTrue(all(torch.isfinite(torch.tensor(vector)).tolist()))
            self.assertAlmostEqual(sum(value * value for value in vector), 1.0, places=5)

    def test_rejects_empty_or_oversized_input(self):
        with self.assertRaises(ValueError):
            validate_texts([])
        with self.assertRaises(ValueError):
            validate_texts([" "])
        with self.assertRaises(ValueError):
            validate_texts(["x" * 20001])

    def test_cosine_similarity_handles_related_and_zero_vectors(self):
        left = [0.0] * VECTOR_DIMENSIONS
        right = [0.0] * VECTOR_DIMENSIONS
        left[0] = 1.0
        right[0] = 1.0
        self.assertAlmostEqual(cosine_similarity(left, right), 1.0)
        self.assertEqual(cosine_similarity([0.0] * VECTOR_DIMENSIONS, right), 0.0)

    def test_loopback_http_endpoint_returns_validated_embeddings(self):
        server = ThreadingHTTPServer(
            ("127.0.0.1", 0), SemanticRequestHandler
        )
        SemanticRequestHandler.engine = EmbeddingEngine(
            FakeTokenizer(), FakeModel()
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(f"{base_url}/health") as response:
                health = json.loads(response.read())
            self.assertTrue(health["ready"])
            self.assertEqual(health["dimensions"], VECTOR_DIMENSIONS)
            self.assertEqual(health["model"], MODEL_NAME)
            self.assertEqual(health["revision"], MODEL_REVISION)

            body = json.dumps({"texts": ["sample opportunity"]}).encode()
            request = Request(
                f"{base_url}/embed",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request) as response:
                payload = json.loads(response.read())
            self.assertEqual(len(payload["embeddings"][0]), VECTOR_DIMENSIONS)
            self.assertEqual(payload["revision"], MODEL_REVISION)

            with patch.dict(os.environ, {"SEMANTIC_EMBEDDING_TOKEN": "test-token"}):
                unauthorized = Request(
                    f"{base_url}/embed",
                    data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as error:
                    urlopen(unauthorized)
                self.assertEqual(error.exception.code, 401)

                authorized = Request(
                    f"{base_url}/embed",
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": "Bearer test-token",
                    },
                    method="POST",
                )
                with urlopen(authorized) as response:
                    self.assertEqual(response.status, 200)

            invalid = Request(
                f"{base_url}/embed",
                data=b'{"texts":[""]}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(HTTPError) as error:
                urlopen(invalid)
            self.assertEqual(error.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
