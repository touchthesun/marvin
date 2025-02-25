"""
Auth provider implementation for Marvin.

This package contains the implementation of the authentication and credential
management system for LLM providers in Marvin.
"""

from .base import AuthProviderInterface
from .local_provider import LocalAuthProvider

__all__ = [
    "AuthProviderInterface",
    "LocalAuthProvider",
]