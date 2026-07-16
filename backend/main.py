import os
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, HTMLResponse
from typing import List, Optional
from datetime import datetime, timedelta

import database
import models
import auth
import insights
import reports

app = FastAPI(title="Smart Expense Tracker API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup DB initialization
@app.on_event("startup")
def startup_event():
    database.init_db()

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register")
def register(user: models.UserRegister):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    hashed_pwd = auth.hash_password(user.password)
    
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (user.username.lower(), hashed_pwd)
        )
        conn.commit()
        
        # Get new user ID
        cursor.execute("SELECT id FROM users WHERE username = ?", (user.username.lower(),))
        new_user = cursor.fetchone()
        user_id = new_user["id"]
        
        # Prepopulate a couple of budgets for Food & Entertainment to show initial structure
        cursor.execute("INSERT INTO category_budgets (user_id, category, budget_amount) VALUES (?, 'Food', 1000.0)", (user_id,))
        cursor.execute("INSERT INTO category_budgets (user_id, category, budget_amount) VALUES (?, 'Entertainment', 500.0)", (user_id,))
        conn.commit()
        
    except database.sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    
    conn.close()
    return {"message": "User registered successfully"}

@app.post("/api/auth/login")
def login(user: models.UserLogin):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash, pin_hash FROM users WHERE username = ?", (user.username.lower(),))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not auth.verify_password(user.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    
    token = auth.create_access_token(data={"sub": user.username.lower(), "id": row["id"]})
    return {
        "access_token": token, 
        "token_type": "bearer", 
        "requires_pin": row["pin_hash"] is not None
    }

@app.post("/api/auth/verify-pin")
def verify_pin(data: models.UserPINVerify, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (current_user["id"],))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not row["pin_hash"]:
        # If no PIN configured, allow access
        return {"status": "success", "message": "No PIN configured"}
        
    if not auth.verify_password(data.pin, row["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid PIN")
        
    return {"status": "success", "message": "PIN verified"}

@app.post("/api/auth/update-pin")
def update_pin(data: models.UserPINUpdate, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    hashed_pin = auth.hash_password(data.pin) if data.pin else None
    
    cursor.execute("UPDATE users SET pin_hash = ? WHERE id = ?", (hashed_pin, current_user["id"]))
    conn.commit()
    conn.close()
    return {"message": "PIN updated successfully"}

# --- USER PROFILE & SETTINGS ---

@app.get("/api/user/profile")
def get_profile(current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT username, avatar, monthly_budget, financial_goal, streak, 
               currency, theme, accent_color, font_size, notifications, language 
        FROM users WHERE id = ?
    """, (current_user["id"],))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    # Helper to parse dates in multiple formats safely
    def safe_parse_date(date_str):
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except (ValueError, AttributeError):
                continue
        return None

    dates_raw = cursor.fetchall()
    dates = []
    for r in dates_raw:
        parsed = safe_parse_date(r["date"])
        if parsed:
            dates.append(parsed)
            
    streak = 0
    if dates:
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        if dates[0] == today or dates[0] == yesterday:
            streak = 1
            for i in range(len(dates) - 1):
                if (dates[i] - dates[i+1]).days == 1:
                    streak += 1
                elif (dates[i] - dates[i+1]).days > 1:
                    break
        cursor.execute("UPDATE users SET streak = ? WHERE id = ?", (streak, current_user["id"]))
        conn.commit()
        
    user_data = dict(row)
    user_data["streak"] = streak
    
    # Simple badge reward algorithm
    badges = []
    cursor.execute("SELECT COUNT(*) as count, SUM(amount) as total FROM expenses WHERE user_id = ?", (current_user["id"],))
    stats = cursor.fetchone()
    count = stats["count"] or 0
    total = stats["total"] or 0
    
    if count >= 1: badges.append({"id": "first", "title": "Saver Kickstart", "desc": "Logged first expense"})
    if count >= 10: badges.append({"id": "consistent", "title": "Disciplined", "desc": "Logged 10+ expenses"})
    if streak >= 5: badges.append({"id": "streak", "title": "Habitual", "desc": "5-day logging streak"})
    if total > 5000: badges.append({"id": "heavy", "title": "Heavy Roller", "desc": "Tracked over $5,000"})
    
    user_data["badges"] = badges
    
    # Financial Score: basic logic combining budget tracking, savings, streak
    # (starts at 70, increases with streak, drops if over budget)
    cursor.execute("SELECT SUM(amount) as spent FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?", 
                   (current_user["id"], datetime.now().strftime("%Y-%m")))
    m_spent = cursor.fetchone()["spent"] or 0
    score = 700 + (streak * 10)
    if m_spent > row["monthly_budget"]:
        score -= 80
    elif m_spent > 0 and m_spent < row["monthly_budget"] * 0.7:
        score += 50
    user_data["financial_score"] = min(max(score, 300), 850) # Range 300 to 850 FICO-style
    
    conn.close()
    return user_data

@app.put("/api/user/profile")
def update_profile(data: models.UserUpdate, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    for key, value in data.dict(exclude_unset=True).items():
        updates.append(f"{key} = ?")
        params.append(value)
        
    if not updates:
        conn.close()
        return {"message": "No fields to update"}
        
    params.append(current_user["id"])
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
    
    cursor.execute(query, tuple(params))
    conn.commit()
    conn.close()
    return {"message": "Profile settings updated successfully"}

# --- EXPENSE CRUD & FILTERS ---

@app.get("/api/expenses")
def get_expenses(
    q: Optional[str] = None,
    category: Optional[str] = None,
    payment_method: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(auth.get_current_user)
):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    conditions = ["user_id = ?"]
    params = [current_user["id"]]
    
    if q:
        conditions.append("(description LIKE ? OR notes LIKE ? OR location LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
        
    if category:
        conditions.append("category = ?")
        params.append(category)
        
    if payment_method:
        conditions.append("payment_method = ?")
        params.append(payment_method)
        
    if start_date:
        conditions.append("date >= ?")
        params.append(start_date)
        
    if end_date:
        conditions.append("date <= ?")
        params.append(end_date)
        
    where_clause = " AND ".join(conditions)
    
    # Sorting validation
    db_sort_by = "date"
    if sort_by in ["amount", "date", "created_at"]:
        db_sort_by = sort_by
        
    db_sort_order = "DESC"
    if sort_order.upper() in ["ASC", "DESC"]:
        db_sort_order = sort_order.upper()
        
    query = f"""
        SELECT id, amount, category, description, date, time, payment_method, location, notes 
        FROM expenses 
        WHERE {where_clause}
        ORDER BY {db_sort_by} {db_sort_order}, time DESC
        LIMIT ? OFFSET ?
    """
    
    cursor.execute(query, tuple(params + [limit, offset]))
    expenses = [dict(row) for row in cursor.fetchall()]
    
    # Get total count for pagination
    count_query = f"SELECT COUNT(*) as total FROM expenses WHERE {where_clause}"
    cursor.execute(count_query, tuple(params))
    total_count = cursor.fetchone()["total"]
    
    conn.close()
    return {"expenses": expenses, "total_count": total_count}

@app.post("/api/expenses")
def create_expense(expense: models.ExpenseCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO expenses (user_id, amount, category, description, date, time, payment_method, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        current_user["id"],
        expense.amount,
        expense.category,
        expense.description,
        expense.date,
        expense.time,
        expense.payment_method,
        expense.location,
        expense.notes
    ))
    
    conn.commit()
    expense_id = cursor.lastrowid
    
    # Check category and monthly budget triggers for warning notification flags
    # Get total spent in category this month
    now = datetime.now()
    month_str = now.strftime("%Y-%m")
    
    cursor.execute("""
        SELECT SUM(amount) as total FROM expenses 
        WHERE user_id = ? AND category = ? AND strftime('%Y-%m', date) = ?
    """, (current_user["id"], expense.category, month_str))
    cat_spent = cursor.fetchone()["total"] or 0.0
    
    cursor.execute("""
        SELECT budget_amount FROM category_budgets 
        WHERE user_id = ? AND category = ?
    """, (current_user["id"], expense.category))
    cat_budget_row = cursor.fetchone()
    
    cat_warning = None
    if cat_budget_row:
        cat_budget = cat_budget_row["budget_amount"]
        if cat_spent > cat_budget:
            cat_warning = f"Budget exceeded for {expense.category}! Spent: {cat_spent:.2f} / {cat_budget:.2f}"
        elif cat_spent >= cat_budget * 0.8:
            cat_warning = f"Budget warning for {expense.category}: used {cat_spent / cat_budget * 100:.1f}%"
            
    conn.close()
    
    return {
        "message": "Expense added successfully", 
        "expense_id": expense_id,
        "category_warning": cat_warning
    }

@app.put("/api/expenses/{id}")
def update_expense(id: int, expense: models.ExpenseUpdate, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    # Verify owner
    cursor.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found or unauthorized")
        
    updates = []
    params = []
    for key, val in expense.dict(exclude_unset=True).items():
        updates.append(f"{key} = ?")
        params.append(val)
        
    if not updates:
        conn.close()
        return {"message": "No fields to update"}
        
    params.append(id)
    query = f"UPDATE expenses SET {', '.join(updates)} WHERE id = ?"
    cursor.execute(query, tuple(params))
    conn.commit()
    conn.close()
    
    return {"message": "Expense updated successfully"}

@app.delete("/api/expenses/{id}")
def delete_expense(id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    # Verify owner
    cursor.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found or unauthorized")
        
    cursor.execute("DELETE FROM expenses WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"message": "Expense deleted successfully"}

# --- CATEGORY BUDGETS ---

@app.get("/api/budgets/categories")
def get_category_budgets(current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT cb.category, cb.budget_amount, IFNULL(SUM(e.amount), 0) as spent
        FROM category_budgets cb
        LEFT JOIN expenses e ON cb.category = e.category 
            AND e.user_id = cb.user_id 
            AND strftime('%Y-%m', e.date) = ?
        WHERE cb.user_id = ?
        GROUP BY cb.category
    """, (datetime.now().strftime("%Y-%m"), current_user["id"]))
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/budgets/categories")
def set_category_budget(budget: models.CategoryBudgetCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO category_budgets (user_id, category, budget_amount)
        VALUES (?, ?, ?)
    """, (current_user["id"], budget.category, budget.budget_amount))
    conn.commit()
    conn.close()
    return {"message": "Category budget set successfully"}

@app.delete("/api/budgets/categories/{category}")
def delete_category_budget(category: str, current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM category_budgets WHERE user_id = ? AND category = ?", (current_user["id"], category))
    conn.commit()
    conn.close()
    return {"message": "Category budget removed"}

# --- ANALYTICS, STATS & INSIGHTS ---

@app.get("/api/analytics/dashboard")
def get_dashboard_data(current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    uid = current_user["id"]
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    month_str = datetime.now().strftime("%Y-%m")
    
    # 1. Monthly Budget
    cursor.execute("SELECT monthly_budget, currency FROM users WHERE id = ?", (uid,))
    user_info = cursor.fetchone()
    monthly_budget = user_info["monthly_budget"] if user_info else 5000.0
    currency = user_info["currency"] if user_info else "USD"
    
    # 2. Today's Spending
    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date = ?", (uid, today_str))
    today_spent = cursor.fetchone()["total"] or 0.0
    
    # 3. Monthly Spending
    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?", (uid, month_str))
    month_spent = cursor.fetchone()["total"] or 0.0
    
    # 4. Total Lifetime Spending
    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id = ?", (uid,))
    total_spent = cursor.fetchone()["total"] or 0.0
    
    # 5. Highest Expense
    cursor.execute("SELECT MAX(amount) as val FROM expenses WHERE user_id = ?", (uid,))
    highest_expense = cursor.fetchone()["val"] or 0.0
    
    # 6. Average Daily Spending (current month)
    cursor.execute("""
        SELECT SUM(amount) as total, COUNT(DISTINCT date) as days 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    """, (uid, month_str))
    avg_row = cursor.fetchone()
    total_m = avg_row["total"] or 0.0
    days_m = avg_row["days"] or 1
    avg_daily = total_m / max(days_m, 1)
    
    # 7. Recent Transactions (last 5)
    cursor.execute("""
        SELECT id, amount, category, description, date, time, payment_method 
        FROM expenses 
        WHERE user_id = ? 
        ORDER BY date DESC, time DESC 
        LIMIT 5
    """, (uid,))
    recent = [dict(r) for r in cursor.fetchall()]
    
    # 8. Budget progress rings & savings rate
    savings_indicator = 0.0
    if monthly_budget > 0:
        savings_indicator = max(0.0, ((monthly_budget - month_spent) / monthly_budget) * 100)
        
    conn.close()
    
    return {
        "monthly_budget": monthly_budget,
        "currency": currency,
        "today_spent": today_spent,
        "month_spent": month_spent,
        "total_spent": total_spent,
        "highest_expense": highest_expense,
        "avg_daily": avg_daily,
        "recent_transactions": recent,
        "savings_indicator": savings_indicator,
    }

@app.get("/api/analytics/charts")
def get_chart_data(current_user: dict = Depends(auth.get_current_user)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    uid = current_user["id"]
    month_str = datetime.now().strftime("%Y-%m")
    
    # 1. Pie Chart: Category Distribution (current month)
    cursor.execute("""
        SELECT category, SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY category
    """, (uid, month_str))
    category_distribution = [dict(r) for r in cursor.fetchall()]
    
    # 2. Line Chart: Daily Trend for current month
    cursor.execute("""
        SELECT date, SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY date
        ORDER BY date ASC
    """, (uid, month_str))
    spending_trend = [dict(r) for r in cursor.fetchall()]
    
    # 3. Bar Chart: Monthly spending comparison (past 6 months)
    cursor.execute("""
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ?
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
    """, (uid,))
    monthly_comparison = [dict(r) for r in cursor.fetchall()]
    monthly_comparison.reverse()  # chronological order
    
    # 4. Payment Method Distribution
    cursor.execute("""
        SELECT payment_method, SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY payment_method
    """, (uid, month_str))
    payment_method_distribution = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return {
        "category_distribution": category_distribution,
        "spending_trend": spending_trend,
        "monthly_comparison": monthly_comparison,
        "payment_method_distribution": payment_method_distribution
    }

@app.get("/api/analytics/insights")
def get_ai_insights(current_user: dict = Depends(auth.get_current_user)):
    # Fetch currency symbol
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT currency FROM users WHERE id = ?", (current_user["id"],))
    row = cursor.fetchone()
    conn.close()
    
    currency = row["currency"] if row else "USD"
    symbol_map = {"USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CAD": "C$"}
    currency_symbol = symbol_map.get(currency, currency)
    
    return insights.generate_financial_insights(current_user["id"], currency_symbol)

# --- REPORTS & BACKUPS ---

@app.get("/api/reports/csv")
def download_csv(current_user: dict = Depends(auth.get_current_user)):
    csv_data = reports.export_expenses_csv(current_user["id"])
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses_export.csv"}
    )

@app.post("/api/reports/csv")
def upload_csv(file: UploadFile = File(...), current_user: dict = Depends(auth.get_current_user)):
    contents = file.file.read().decode("utf-8")
    count = reports.import_expenses_csv(current_user["id"], contents)
    return {"message": f"Successfully imported {count} expenses"}

@app.get("/api/reports/backup")
def download_backup(current_user: dict = Depends(auth.get_current_user)):
    backup_data = reports.generate_json_backup(current_user["id"])
    return Response(
        content=backup_data,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=tracker_backup.json"}
    )

@app.post("/api/reports/backup")
async def upload_backup(file: UploadFile = File(...), current_user: dict = Depends(auth.get_current_user)):
    contents = (await file.read()).decode("utf-8")
    success = reports.restore_json_backup(current_user["id"], contents)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid backup file structure")
    return {"message": "Backup restored successfully"}

@app.get("/api/reports/pdf/{month}", response_class=HTMLResponse)
def get_pdf_report(month: str, current_user: dict = Depends(auth.get_current_user)):
    # Returns styled print-ready HTML page
    html_report = reports.generate_print_report_html(current_user["id"], month)
    return HTMLResponse(content=html_report)


# --- SERVING STATIC FRONTEND ---
frontend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
else:
    # If starting server before frontend folder is fully populated
    @app.get("/")
    def index_fallback():
        return {"status": "running", "message": "API server is active. Frontend static assets folder not yet loaded."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
