"""The trash app with a sync SQLAlchemy session; `app_async.py` is the same app on an async one."""
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, delete, func, select, update
from sqlalchemy.orm import Session, sessionmaker

from store.models import Item

engine = create_engine("sqlite:///trash.db")
SessionLocal = sessionmaker(engine)
app = FastAPI()


def get_session():
    with SessionLocal() as session:
        yield session


class NewItem(BaseModel):
    name: str
    size: int = 0


@app.post("/items/", status_code=201)
def create_item(new: NewItem, session: Session = Depends(get_session)):
    item = Item(name=new.name, size=new.size)
    session.add(item)
    session.commit()
    return {"id": item.id, "name": item.name}


@app.get("/items/")
def list_items(session: Session = Depends(get_session)):
    return {"items": list(session.scalars(select(Item.name).where(Item.trashed_at.is_(None)).order_by(Item.id)))}


@app.post("/items/{item_id}/delete/")
def move_to_trash(item_id: int, session: Session = Depends(get_session)):
    updated = session.execute(update(Item).where(Item.id == item_id, Item.trashed_at.is_(None))
                              .values(trashed_at=datetime.now(timezone.utc))).rowcount
    session.commit()
    return JSONResponse({"trashed": item_id} if updated else {"error": "not_found"}, status_code=200 if updated else 404)


@app.post("/items/{item_id}/restore/")
def restore(item_id: int, session: Session = Depends(get_session)):
    updated = session.execute(update(Item).where(Item.id == item_id, Item.trashed_at.is_not(None))
                              .values(trashed_at=None)).rowcount
    session.commit()
    return JSONResponse({"restored": item_id} if updated else {"error": "not_in_trash"}, status_code=200 if updated else 404)


@app.post("/trash/empty/")
def empty_trash(session: Session = Depends(get_session)):
    removed = session.execute(delete(Item).where(Item.trashed_at.is_not(None))).rowcount
    session.commit()
    return {"removed": removed}


@app.get("/usage/")
def usage(session: Session = Depends(get_session)):
    return {"used": session.scalar(select(func.coalesce(func.sum(Item.size), 0)))}
