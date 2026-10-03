from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


database_url = settings.database_url
if database_url.startswith('postgres://'):
    database_url = 'postgresql+psycopg://' + database_url[len('postgres://'):]
elif database_url.startswith('postgresql://'):
    database_url = 'postgresql+psycopg://' + database_url[len('postgresql://'):]
options = dict(pool_pre_ping=True, pool_recycle=settings.db_pool_recycle)
if not database_url.startswith('sqlite'):
    options.update(pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow,
                   pool_timeout=settings.db_pool_timeout)
if database_url.startswith('postgresql'):
    options['connect_args'] = {'connect_timeout':settings.db_connect_timeout,
        'options':f'-c statement_timeout={settings.db_statement_timeout_ms} -c lock_timeout={settings.db_lock_timeout_ms}'}
elif database_url.startswith('sqlite'):
    options['connect_args'] = {'check_same_thread':False}
engine = create_engine(database_url, **options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
