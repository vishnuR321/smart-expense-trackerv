from pydantic import BaseModel, Field
from typing import Optional, List

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class UserPINUpdate(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)

class UserPINVerify(BaseModel):
    pin: str

class UserUpdate(BaseModel):
    avatar: Optional[str] = None
    monthly_budget: Optional[float] = None
    financial_goal: Optional[str] = None
    currency: Optional[str] = None
    theme: Optional[str] = None
    accent_color: Optional[str] = None
    font_size: Optional[str] = None
    notifications: Optional[str] = None
    language: Optional[str] = None

class ExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0)
    category: str
    description: str = Field(..., min_length=1)
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    payment_method: str
    location: Optional[str] = None
    notes: Optional[str] = None

class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    payment_method: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None

class CategoryBudgetCreate(BaseModel):
    category: str
    budget_amount: float = Field(..., ge=0)

class CategoryBudgetResponse(BaseModel):
    id: int
    category: str
    budget_amount: float

class FinancialGoalUpdate(BaseModel):
    goal: str
