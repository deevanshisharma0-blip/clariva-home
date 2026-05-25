from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Business(Base):
    __tablename__ = "businesses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(50), default="shopify_dropshipping")
    shopify_domain: Mapped[Optional[str]] = mapped_column(String(200))
    shopify_token: Mapped[Optional[str]] = mapped_column(String(500))
    logo_emoji: Mapped[str] = mapped_column(String(10), default="🏪")
    color: Mapped[str] = mapped_column(String(20), default="#7c3aed")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    config: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)

    agents: Mapped[list["Agent"]] = relationship(back_populates="business", cascade="all, delete-orphan")
    approvals: Mapped[list["Approval"]] = relationship(back_populates="business", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="business", cascade="all, delete-orphan")
    metrics: Mapped[list["Metric"]] = relationship(back_populates="business", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    agent_id: Mapped[str] = mapped_column(String(50))  # e.g. "ceo", "product_research"
    name: Mapped[str] = mapped_column(String(100))
    department: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="idle")
    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime)
    next_run: Mapped[Optional[str]] = mapped_column(String(100))
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0)
    tasks_failed: Mapped[int] = mapped_column(Integer, default=0)
    load: Mapped[int] = mapped_column(Integer, default=0)
    memory: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    config: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)

    business: Mapped["Business"] = relationship(back_populates="agents")
    tasks: Mapped[list["Task"]] = relationship(back_populates="agent", cascade="all, delete-orphan")
    approvals: Mapped[list["Approval"]] = relationship(back_populates="agent")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    name: Mapped[str] = mapped_column(String(300))
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    result: Mapped[Optional[dict]] = mapped_column(JSON)
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    agent: Mapped["Agent"] = relationship(back_populates="tasks")


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    agent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agents.id"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(100))
    risk_level: Mapped[str] = mapped_column(String(20), default="medium")
    estimated_cost: Mapped[str] = mapped_column(String(100), default="$0.00")
    forecast: Mapped[str] = mapped_column(String(300), default="")
    payload: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    simulation: Mapped[Optional[dict]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    decision_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    execution_status: Mapped[Optional[str]] = mapped_column(String(30))
    execution_result: Mapped[Optional[dict]] = mapped_column(JSON)
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    business: Mapped["Business"] = relationship(back_populates="approvals")
    agent: Mapped[Optional["Agent"]] = relationship(back_populates="approvals")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    name: Mapped[str] = mapped_column(String(300))
    sku: Mapped[Optional[str]] = mapped_column(String(100))
    price_cad: Mapped[float] = mapped_column(Float, default=0)
    cogs_cad: Mapped[float] = mapped_column(Float, default=0)
    supplier: Mapped[str] = mapped_column(String(100), default="CJ Dropshipping")
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default="active")
    demand_score: Mapped[int] = mapped_column(Integer, default=0)
    margin_pct: Mapped[float] = mapped_column(Float, default=0)
    orders_7d: Mapped[int] = mapped_column(Integer, default=0)
    orders_30d: Mapped[int] = mapped_column(Integer, default=0)
    revenue_7d: Mapped[float] = mapped_column(Float, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0)
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    hero: Mapped[bool] = mapped_column(Boolean, default=False)
    shopify_product_id: Mapped[Optional[str]] = mapped_column(String(100))
    data: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="products")


class Metric(Base):
    __tablename__ = "metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    name: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float, default=0)
    label: Mapped[Optional[str]] = mapped_column(String(200))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="metrics")


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[Optional[int]] = mapped_column(Integer)
    agent_id: Mapped[Optional[str]] = mapped_column(String(50))
    event_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[Optional[str]] = mapped_column(Text)
    data: Mapped[Optional[dict]] = mapped_column(JSON)
    causation_id: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Order(Base):
    """Tracks Shopify orders and their CJ fulfillment status."""
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    shopify_order_id: Mapped[str] = mapped_column(String(100), unique=True)
    shopify_order_number: Mapped[Optional[str]] = mapped_column(String(50))
    customer_name: Mapped[Optional[str]] = mapped_column(String(200))
    customer_email: Mapped[Optional[str]] = mapped_column(String(200))
    shipping_country: Mapped[Optional[str]] = mapped_column(String(10))
    total_price: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="CAD")
    line_items: Mapped[Optional[dict]] = mapped_column(JSON)
    # CJ fulfillment
    cj_order_id: Mapped[Optional[str]] = mapped_column(String(200))
    cj_tracking_number: Mapped[Optional[str]] = mapped_column(String(200))
    cj_status: Mapped[Optional[str]] = mapped_column(String(50))  # pending/submitted/shipped/delivered/failed
    fulfillment_status: Mapped[str] = mapped_column(String(50), default="pending")
    # Timestamps
    shopify_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    cj_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    raw: Mapped[Optional[dict]] = mapped_column(JSON)  # full Shopify payload


class Creative(Base):
    __tablename__ = "creatives"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(Integer)
    hook: Mapped[str] = mapped_column(String(500))
    platform: Mapped[str] = mapped_column(String(100))
    creative_type: Mapped[str] = mapped_column(String(50), default="script")
    status: Mapped[str] = mapped_column(String(30), default="ready")
    roas: Mapped[float] = mapped_column(Float, default=0)
    cac: Mapped[float] = mapped_column(Float, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[Optional[str]] = mapped_column(Text)
    file_path: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
