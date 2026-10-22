"""Release identity and readiness checks for the six management tools."""
from sqlalchemy import inspect

MANAGEMENT_API_VERSION = '20261022-management-operations-v7'
REQUIRED_ROUTES = frozenset({
    '/v1/admin/operations-desk/support', '/v1/admin/operations-desk/feedback',
    '/v1/admin/operations-desk/referrals', '/v1/admin/operations-desk/announcement-drafts',
    '/v1/admin/operations-desk/sources/{kind}/{sid}/case',
    '/v1/admin/workspace', '/v1/admin/workspace/users', '/v1/admin/workspace/role-requests',
    '/v1/admin/workspace/role-requests/{request_id}/decision',
    '/v1/admin/cases', '/v1/admin/operations/overview',
    '/v1/admin/operations/emergency-chat', '/v1/admin/finance-audit/overview',
    '/v1/admin/finance-audit/manual-operations', '/v1/admin/finance-audit/alerts',
    '/v1/admin/fraud-review/signals',
    '/v1/admin/cases/{case_id}/assign', '/v1/admin/cases/{case_id}/evidence-upload',
    '/v1/admin/cases/{case_id}/notes', '/v1/admin/cases/{case_id}/sanction-request',
    '/v1/admin/operations/emergency-chat/{action_id}/revoke',
    '/v1/admin/management/finance-requests', '/v1/admin/management/finance-requests/{request_id}/review',
    '/v1/admin/management/finance-requests/{request_id}/decision',
    '/v1/admin/management/audit', '/v1/admin/management/signal-reviews',
    '/v1/admin/finance-audit/orders', '/v1/admin/finance-audit/vip',
})
REQUIRED_TABLES = ('management_operation_history','management_source_cases','management_feedback_work','management_announcement_drafts','management_role_requests', 'management_cases', 'management_case_events', 'management_emergency_chat_actions', 'management_evidence', 'management_finance_requests', 'management_signal_reviews')

def check_management_ready(app, connection):
    # FastAPI may retain included routers lazily; its schema resolves both forms.
    paths = set(app.openapi().get('paths', {}))
    if not REQUIRED_ROUTES.issubset(paths):
        raise RuntimeError('Management API routes are missing')
    schema = inspect(connection)
    if not all(schema.has_table(name) for name in REQUIRED_TABLES):
        raise RuntimeError('Management schema is missing')
