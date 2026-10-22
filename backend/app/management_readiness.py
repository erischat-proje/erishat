"""Release identity and readiness checks for the six management tools."""
from sqlalchemy import inspect

MANAGEMENT_API_VERSION = '20261022-management-v4'
REQUIRED_ROUTES = frozenset({
    '/v1/admin/cases', '/v1/admin/operations/overview',
    '/v1/admin/operations/emergency-chat', '/v1/admin/finance-audit/overview',
    '/v1/admin/finance-audit/manual-operations', '/v1/admin/finance-audit/alerts',
    '/v1/admin/fraud-review/signals',
})
REQUIRED_TABLES = ('management_cases', 'management_case_events', 'management_emergency_chat_actions')

def check_management_ready(app, connection):
    # FastAPI may retain included routers lazily; its schema resolves both forms.
    paths = set(app.openapi().get('paths', {}))
    if not REQUIRED_ROUTES.issubset(paths):
        raise RuntimeError('Management API routes are missing')
    schema = inspect(connection)
    if not all(schema.has_table(name) for name in REQUIRED_TABLES):
        raise RuntimeError('Management schema is missing')
