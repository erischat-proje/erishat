from __future__ import annotations

from . import family_routes
from . import platform_routes


_original_register_platform_auth = platform_routes.register_platform_auth
_attached = False


def _register_platform_auth_with_family(current_user_dependency):
    global _attached
    _original_register_platform_auth(current_user_dependency)
    if _attached:
        return
    family_routes.register_family_auth(current_user_dependency)
    platform_routes.router.routes.extend(family_routes.router.routes)
    _attached = True


platform_routes.register_platform_auth = _register_platform_auth_with_family
