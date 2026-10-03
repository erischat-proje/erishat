"""Slow request diagnostics and bounded access-path indexes."""
import logging
import time
from uuid import uuid4
from fastapi.responses import JSONResponse
from sqlalchemy import Index
from sqlalchemy.exc import OperationalError, TimeoutError as PoolTimeout
from .db import Base, engine

log = logging.getLogger('erischat.performance')


def install_diagnostics(app):
    @app.middleware('http')
    async def timing(request, call_next):
        started = time.perf_counter()
        request_id = uuid4().hex[:16]
        request.state.request_id = request_id
        response = await call_next(request)
        elapsed = (time.perf_counter() - started) * 1000
        response.headers['X-Request-ID'] = request_id
        response.headers['Server-Timing'] = 'app;dur=%.1f' % elapsed
        if elapsed >= 1000 or response.status_code >= 500:
            route = request.scope.get('route')
            # Do not log bearer tokens, request bodies, query strings or private IDs.
            log.warning('request id=%s method=%s route=%s status=%s duration_ms=%.1f',
                request_id, request.method, getattr(route, 'path', 'unmatched'), response.status_code, elapsed)
        return response

    async def database_unavailable(request, exc):
        log.error('database unavailable request=%s kind=%s', getattr(request.state, 'request_id', 'unknown'), type(exc).__name__)
        return JSONResponse(status_code=503, headers={'Retry-After':'5'}, content={
            'detail':{'code':'database_busy', 'message':'Sunucu şu anda veritabanına erişemiyor. Birkaç saniye sonra yeniden deneyin.'}})
    app.add_exception_handler(OperationalError, database_unavailable)
    app.add_exception_handler(PoolTimeout, database_unavailable)


def ensure_query_indexes():
    specs = [
        ('messages', ('conversation_id','created_at','id')),
        ('room_chat_messages', ('room_id','id')),
        ('conversation_read_states', ('user_id','conversation_id')),
        ('notifications', ('user_id','created_at')),
        ('social_posts', ('user_id','created_at','id')),
        ('social_stories', ('user_id','expires_at')),
        ('room_gift_events', ('recipient_id','sender_id')),
        ('room_gift_events', ('sender_id',)),
        ('direct_message_gifts', ('recipient_id','sender_id')),
        ('direct_message_gifts', ('sender_id',)),
    ]
    for table_name, columns in specs:
        table = Base.metadata.tables.get(table_name)
        if table is None or any(c not in table.c for c in columns):
            continue
        name = 'ix_perf_' + table_name + '_' + '_'.join(columns)
        existing = next((i for i in table.indexes if i.name == name), None)
        index = existing if existing is not None else Index(name, *(table.c[c] for c in columns))
        try:
            index.create(engine, checkfirst=True)
        except (OperationalError, PoolTimeout):
            # An optional tuning index cannot keep an otherwise valid deployment offline.
            log.warning('performance index deferred: %s', name)
