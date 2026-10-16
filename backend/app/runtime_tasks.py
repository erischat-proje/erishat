"""Keep synchronous SQLAlchemy work off the ASGI loop; sockets stay on that loop."""
import asyncio
import functools
import inspect
from starlette.concurrency import run_in_threadpool

_live_loop = None


def bind_live_loop():
    global _live_loop
    _live_loop = asyncio.get_running_loop()


def database_task(fn):
    """Run one complete request transaction sequentially on a worker.

    Existing async handlers use synchronous Sessions and async file reads. A worker
    owns their coroutine for its whole lifetime; live_socket marshals socket I/O
    back to ASGI. Never use this decorator on a long-lived websocket endpoint.
    """
    @functools.wraps(fn)
    async def wrapped(*args, **kwargs):
        if _live_loop is not asyncio.get_running_loop():
            bind_live_loop()
        return await run_in_threadpool(lambda: asyncio.run(fn(*args, **kwargs)))
    wrapped.__signature__ = inspect.signature(fn, eval_str=True)
    return wrapped


def live_socket(fn):
    @functools.wraps(fn)
    async def wrapped(*args, **kwargs):
        loop = asyncio.get_running_loop()
        if _live_loop is None or loop is _live_loop:
            return await fn(*args, **kwargs)
        future = asyncio.run_coroutine_threadsafe(fn(*args, **kwargs), _live_loop)
        return await asyncio.wrap_future(future)
    return wrapped
