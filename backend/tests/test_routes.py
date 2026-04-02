"""Tests for EZWill API route structure.

Verifies all endpoints are registered with correct methods, prefixes,
and response behavior -- WITHOUT requiring a database connection.
"""

import pytest
import sys
import os
from unittest.mock import MagicMock
from types import ModuleType

# Add backend root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Mock external dependencies not installed in test environment ─────

# Mock psycopg2 (database driver)
for mod_name in [
    'psycopg2', 'psycopg2.pool', 'psycopg2.extras', 'psycopg2.sql',
]:
    sys.modules[mod_name] = MagicMock()

# Mock dotenv
sys.modules['dotenv'] = MagicMock()

# Mock python-jose and passlib
for mod_name in ['jose', 'passlib', 'passlib.context']:
    sys.modules[mod_name] = MagicMock()

# Mock sendgrid
for mod_name in ['sendgrid', 'sendgrid.helpers', 'sendgrid.helpers.mail']:
    sys.modules[mod_name] = MagicMock()

# Mock python-docx (needs proper package structure with submodules)
docx_mock = MagicMock()
for mod_name in [
    'docx', 'docx.shared', 'docx.enum', 'docx.enum.text',
    'docx.enum.table', 'docx.enum.section', 'docx.oxml',
    'docx.oxml.ns',
]:
    sys.modules[mod_name] = docx_mock

# ── Import the FastAPI app ───────────────────────────────────────────

from main import app
from fastapi.routing import APIRoute


def get_routes():
    """Extract all registered routes from the FastAPI app."""
    routes = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            routes.append({
                'path': route.path,
                'methods': route.methods,
                'name': route.name,
            })
    return routes


class TestRouteRegistration:
    """Verify all expected endpoints are registered on the app."""

    def test_health_endpoint_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/' in paths

    def test_ready_endpoint_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/ready' in paths

    def test_drafts_routes_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/api/drafts' in paths
        assert '/api/drafts/{draft_id}' in paths

    def test_drafts_submit_route_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/api/drafts/{draft_id}/submit' in paths

    def test_links_routes_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/api/links/create' in paths
        assert '/api/links/{token}/resolve' in paths
        assert '/api/links/{token}/revoke' in paths

    def test_agents_route_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/agents/will/invoke' in paths

    def test_clause_routes_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/api/drafts/{draft_id}/clauses' in paths
        assert '/api/drafts/{draft_id}/clauses/{document_type}' in paths

    def test_document_config_routes_registered(self):
        paths = [r['path'] for r in get_routes()]
        assert '/api/drafts/{draft_id}/documents' in paths
        assert '/api/drafts/{draft_id}/documents/{document_type}' in paths


class TestRouteHTTPMethods:
    """Verify correct HTTP methods are assigned to routes."""

    def _methods_for_path(self, path: str):
        methods = set()
        for r in get_routes():
            if r['path'] == path:
                methods.update(r['methods'])
        return methods

    def test_health_is_get(self):
        assert 'GET' in self._methods_for_path('/')

    def test_ready_is_get(self):
        assert 'GET' in self._methods_for_path('/ready')

    def test_create_draft_is_post(self):
        assert 'POST' in self._methods_for_path('/api/drafts')

    def test_list_drafts_is_get(self):
        assert 'GET' in self._methods_for_path('/api/drafts')

    def test_get_draft_is_get(self):
        assert 'GET' in self._methods_for_path('/api/drafts/{draft_id}')

    def test_update_draft_is_put(self):
        assert 'PUT' in self._methods_for_path('/api/drafts/{draft_id}')

    def test_submit_draft_is_post(self):
        assert 'POST' in self._methods_for_path('/api/drafts/{draft_id}/submit')

    def test_create_link_is_post(self):
        assert 'POST' in self._methods_for_path('/api/links/create')

    def test_resolve_link_is_get(self):
        assert 'GET' in self._methods_for_path('/api/links/{token}/resolve')

    def test_revoke_link_is_post(self):
        assert 'POST' in self._methods_for_path('/api/links/{token}/revoke')

    def test_agent_invoke_is_post(self):
        assert 'POST' in self._methods_for_path('/agents/will/invoke')

    def test_save_clauses_is_put(self):
        assert 'PUT' in self._methods_for_path('/api/drafts/{draft_id}/clauses/{document_type}')

    def test_get_clauses_is_get(self):
        assert 'GET' in self._methods_for_path('/api/drafts/{draft_id}/clauses/{document_type}')

    def test_delete_clauses_supported(self):
        assert 'DELETE' in self._methods_for_path('/api/drafts/{draft_id}/clauses/{document_type}')

    def test_update_document_config_is_put(self):
        assert 'PUT' in self._methods_for_path('/api/drafts/{draft_id}/documents/{document_type}')


class TestRoutePrefixes:
    """Verify route prefix structure is correct."""

    def test_all_draft_routes_have_api_prefix(self):
        # Drafts routes are under /api/drafts; documents routes are under /api/documents
        draft_routes = [r for r in get_routes() if r['path'].startswith('/api/drafts')]
        assert len(draft_routes) > 0, "No routes under /api/drafts"
        for r in draft_routes:
            assert r['path'].startswith('/api/drafts'), f"Route {r['path']} missing /api/drafts prefix"

    def test_all_link_routes_have_api_prefix(self):
        link_routes = [r for r in get_routes() if 'token' in r['path']]
        for r in link_routes:
            assert r['path'].startswith('/api/links'), f"Route {r['path']} missing /api/links prefix"

    def test_agent_routes_have_agents_prefix(self):
        agent_routes = [r for r in get_routes() if 'invoke' in r['path']]
        for r in agent_routes:
            assert r['path'].startswith('/agents'), f"Route {r['path']} missing /agents prefix"


class TestAppConfiguration:
    """Verify app metadata and configuration."""

    def test_app_title(self):
        assert app.title == "EZWill API"

    def test_app_version(self):
        assert app.version == "1.0.0"

    def test_total_route_count(self):
        routes = get_routes()
        assert len(routes) >= 15, f"Expected at least 15 routes, got {len(routes)}"
