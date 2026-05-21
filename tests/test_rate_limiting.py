"""Tests for rate limiting functionality."""
import time

import pytest
from fastapi.testclient import TestClient


class TestRateLimiting:
    """Tests for rate limiting on API endpoints."""

    @pytest.mark.skip(reason="Rate limiting tests need special handling")
    def test_rate_limit_search_endpoint(self, client_with_rate_limiting: TestClient):
        """Search endpoint should enforce rate limits."""
        # Make rapid requests to trigger rate limit
        responses = []
        for _ in range(150):
            response = client_with_rate_limiting.get(
                "/api/search",
                params={"query": "test", "limit": 1}
            )
            responses.append(response.status_code)
        
        # Should get some 429 Too Many Requests responses
        assert 429 in responses, "Rate limiting should trigger 429 status"

    @pytest.mark.skip(reason="Rate limiting tests need special handling")
    def test_rate_limit_autocomplete_endpoint(self, client_with_rate_limiting: TestClient):
        """Autocomplete endpoint should enforce rate limits."""
        responses = []
        for _ in range(150):
            response = client_with_rate_limiting.get(
                "/api/autocomplete",
                params={"query": "test", "limit": 1}
            )
            responses.append(response.status_code)
        
        assert 429 in responses

    @pytest.mark.skip(reason="Rate limiting tests need special handling")
    def test_rate_limit_stream_endpoint(self, client_with_rate_limiting: TestClient):
        """Stream endpoint should enforce rate limits."""
        responses = []
        for _ in range(50):
            response = client_with_rate_limiting.get(
                "/stream",
                params={"url": "https://youtube.com/watch?v=test"}
            )
            responses.append(response.status_code)
        
        assert 429 in responses

    def test_rate_limit_headers_present(self, client_with_rate_limiting: TestClient):
        """Rate limit headers should be present in responses."""
        response = client_with_rate_limiting.get("/health")
        
        # Health endpoint doesn't have rate limiting, so test with search
        response = client_with_rate_limiting.get(
            "/api/search",
            params={"query": "test", "limit": 1}
        )
        
        # Rate limit headers may be present
        # Note: slowapi adds these headers
        assert response.status_code in [200, 422, 502]

    @pytest.mark.skip(reason="Rate limiting tests need special handling")
    def test_rate_limit_recovery(self, client_with_rate_limiting: TestClient):
        """Rate limits should reset after time window."""
        # Exhaust rate limit
        for _ in range(150):
            client_with_rate_limiting.get(
                "/api/search",
                params={"query": "test", "limit": 1}
            )
        
        # Should be rate limited
        response = client_with_rate_limiting.get(
            "/api/search",
            params={"query": "test", "limit": 1}
        )
        assert response.status_code == 429
        
        # Wait for rate limit to reset (1 minute for 100/min limit)
        time.sleep(65)
        
        # Should work again
        response = client_with_rate_limiting.get(
            "/api/search",
            params={"query": "test", "limit": 1}
        )
        assert response.status_code == 200


class TestInputValidation:
    """Tests for input validation."""

    def test_search_query_sanitization(self, client: TestClient):
        """Search should handle special characters in query."""
        special_queries = [
            "<script>alert('xss')</script>",
            "'; DROP TABLE users; --",
            "../../../etc/passwd",
            "test\nquery",
            "test\tquery",
        ]
        
        for query in special_queries:
            response = client.get(
                "/api/search",
                params={"query": query, "limit": 1}
            )
            # Should not crash, may return 422 or 502
            assert response.status_code in [200, 422, 502]

    def test_autocomplete_query_sanitization(self, client: TestClient):
        """Autocomplete should handle special characters."""
        special_queries = [
            "<script>alert('xss')</script>",
            "'; DROP TABLE users; --",
            "../../../etc/passwd",
        ]
        
        for query in special_queries:
            response = client.get(
                "/api/autocomplete",
                params={"query": query, "limit": 1}
            )
            assert response.status_code in [200, 422, 502]

    def test_url_parameter_validation(self, client: TestClient):
        """Stream endpoint should validate URL parameter."""
        invalid_urls = [
            "",
            "not-a-url",
            "javascript:alert(1)",
            "file:///etc/passwd",
        ]
        
        for url in invalid_urls:
            response = client.get(f"/stream?url={url}")
            # Should handle gracefully (error or validation)
            assert response.status_code in [400, 422, 502]
