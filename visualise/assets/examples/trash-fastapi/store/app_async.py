"""The trash app from `app.py` on an async SQLAlchemy session."""
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from store.app import NewItem
from store.models import Item

engine = create_async_engine("sqlite+aiosqlite:///trash.db")
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
app = FastAPI()


async def get_session():
    async with SessionLocal() as session:
        yield session


@app.post("/items/", status_code=201)
async def create_item(new: NewItem, session: AsyncSession = Depends(get_session)):
    item = Item(name=new.name, size=new.size)
    session.add(item)
    await session.commit()
    return {"id": item.id, "name": item.name}


@app.get("/items/")
async def list_items(session: AsyncSession = Depends(get_session)):
    names = await session.scalars(select(Item.name).where(Item.trashed_at.is_(None)).order_by(Item.id))
    return {"items": list(names)}


@app.post("/items/{item_id}/delete/")
async def move_to_trash(item_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(update(Item).where(Item.id == item_id, Item.trashed_at.is_(None))
                                   .values(trashed_at=datetime.now(timezone.utc)))
    await session.commit()
    updated = result.rowcount
    return JSONResponse({"trashed": item_id} if updated else {"error": "not_found"}, status_code=200 if updated else 404)


@app.post("/items/{item_id}/restore/")
async def restore(item_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(update(Item).where(Item.id == item_id, Item.trashed_at.is_not(None))
                                   .values(trashed_at=None))
    await session.commit()
    updated = result.rowcount
    return JSONResponse({"restored": item_id} if updated else {"error": "not_in_trash"}, status_code=200 if updated else 404)


@app.post("/trash/empty/")
async def empty_trash(session: AsyncSession = Depends(get_session)):
    result = await session.execute(delete(Item).where(Item.trashed_at.is_not(None)))
    await session.commit()
    return {"removed": result.rowcount}


@app.get("/usage/")
async def usage(session: AsyncSession = Depends(get_session)):
    return {"used": await session.scalar(select(func.coalesce(func.sum(Item.size), 0)))}
