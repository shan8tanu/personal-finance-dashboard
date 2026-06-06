"""SQLite engine over the SAME database file the Node/Prisma app uses.

We never call create_all here — the schema already exists (created by Prisma
migrations). We only read/write existing tables.
"""
from sqlmodel import create_engine, Session
from .config import DB_PATH

# check_same_thread=False so FastAPI's threadpool can share the connection pool.
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)


def get_session():
    with Session(engine) as session:
        yield session
