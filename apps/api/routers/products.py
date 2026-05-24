from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models import Product

router = APIRouter(prefix="/products", tags=["products"])


class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    price_cad: float = 0
    cogs_cad: float = 0
    supplier: str = "CJ Dropshipping"
    supplier_sku: Optional[str] = None
    hero: bool = False


class ProductOut(BaseModel):
    id: int
    business_id: int
    name: str
    sku: Optional[str]
    price_cad: float
    cogs_cad: float
    supplier: str
    status: str
    demand_score: int
    margin_pct: float
    orders_7d: int
    revenue_7d: float
    rating: float
    reviews: int
    hero: bool

    class Config:
        from_attributes = True


@router.get("/{business_id}", response_model=list[ProductOut])
async def list_products(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.business_id == business_id))
    return result.scalars().all()


@router.post("/{business_id}", response_model=ProductOut)
async def create_product(business_id: int, data: ProductCreate, db: AsyncSession = Depends(get_db)):
    margin = ((data.price_cad - data.cogs_cad) / data.price_cad * 100) if data.price_cad else 0
    product = Product(
        business_id=business_id,
        margin_pct=round(margin, 1),
        **data.model_dump(),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{business_id}/{product_id}")
async def delete_product(business_id: int, product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.business_id == business_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    await db.delete(product)
    await db.commit()
    return {"ok": True}
