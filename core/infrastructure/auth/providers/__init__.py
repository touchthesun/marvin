"""
Auth provider implementation for Marvin.

This package contains the implementation of the authentication and credential
management system for LLM providers in Marvin.
"""

from .base_auth_provider import AuthProviderInterface
from .local_auth_provider import LocalAuthProvider

__all__ = [
    "AuthProviderInterface",
    "LocalAuthProvider",
]