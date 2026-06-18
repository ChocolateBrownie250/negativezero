"""Shared pytest setup.

The app's Settings (backend.app.config) requires GROQ_API_KEY, AMETHYST_API_KEY
and reads SSO_SESSION_SECRET. The in-process auth tests need these populated
before the config module is imported, so set sane test defaults here (only if
not already provided by the environment) — this runs at collection time, before
any test module imports backend.app.*.
"""
import os

os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("AMETHYST_API_KEY", "test-amethyst-key")
os.environ.setdefault("SSO_SESSION_SECRET", "test-sso-secret")
