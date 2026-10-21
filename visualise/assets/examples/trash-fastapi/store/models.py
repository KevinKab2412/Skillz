from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Item(Base):
    """A file. Deleting moves it to the trash (trashed_at is set); emptying removes it for good."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(default=0)
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
