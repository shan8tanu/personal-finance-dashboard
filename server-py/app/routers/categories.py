from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..database import engine
from sqlmodel import Session
from ..models import Category
from ..serializers import category_dict
from ..util import new_id
from ..services.categorizer import invalidate_category_cache

router = APIRouter()


class CategoryBody(BaseModel):
    name: str | None = None
    type: str | None = None
    icon: str | None = None
    color: str | None = None


@router.get("")
def list_categories():
    with Session(engine) as s:
        cats = s.exec(select(Category).order_by(Category.name.asc())).all()
        return [category_dict(c) for c in cats]


@router.post("", status_code=201)
def create_category(body: CategoryBody):
    if not body.name or not body.type:
        raise HTTPException(400, "Name and type are required")
    with Session(engine) as s:
        cat = Category(
            id=new_id(), name=body.name, type=body.type,
            icon=body.icon or "circle", color=body.color or "#6B7280",
            isDefault=False,
        )
        s.add(cat)
        s.commit()
        s.refresh(cat)
        invalidate_category_cache()
        return category_dict(cat)


@router.patch("/{cat_id}")
def update_category(cat_id: str, body: CategoryBody):
    with Session(engine) as s:
        cat = s.get(Category, cat_id)
        if not cat:
            raise HTTPException(404, "Category not found")
        if body.name:
            cat.name = body.name
        if body.type:
            cat.type = body.type
        if body.icon:
            cat.icon = body.icon
        if body.color:
            cat.color = body.color
        s.add(cat)
        s.commit()
        s.refresh(cat)
        invalidate_category_cache()
        return category_dict(cat)


@router.delete("/{cat_id}")
def delete_category(cat_id: str):
    with Session(engine) as s:
        cat = s.get(Category, cat_id)
        if not cat:
            raise HTTPException(404, "Category not found")
        if cat.isDefault:
            raise HTTPException(400, "Cannot delete default categories")
        s.delete(cat)
        s.commit()
        invalidate_category_cache()
        return {"success": True}
