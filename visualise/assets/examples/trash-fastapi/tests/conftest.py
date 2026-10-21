"""A fresh in-memory database per test, swapped in for the app's own session."""
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from store.models import Base


@pytest.fixture
def client():
    from store.app import app, get_session

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)

    def test_session():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def aclient(anyio_backend):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from store.app_async import app, get_session

    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def test_session():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
    await engine.dispose()
