from datetime import datetime, timedelta
from database import get_db_connection

def generate_financial_insights(user_id: int, currency: str = "$") -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    insights = []
    
    # Get current date info
    now = datetime.now()
    current_month_str = now.strftime("%Y-%m")
    
    # 1. Total monthly budget and total monthly spending
    cursor.execute("SELECT monthly_budget FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    monthly_budget = user_row["monthly_budget"] if user_row else 5000.0
    
    cursor.execute("""
        SELECT SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    """, (user_id, current_month_str))
    spent_row = cursor.fetchone()
    total_spent = spent_row["total"] if spent_row and spent_row["total"] else 0.0
    
    # Add budget insights
    if total_spent > monthly_budget:
        insights.append({
            "type": "error",
            "title": "Budget Exceeded",
            "message": f"You have exceeded your total monthly budget of {currency}{monthly_budget:,.2f} by {currency}{total_spent - monthly_budget:,.2f}! Consider freezing non-essential spending."
        })
    elif total_spent >= monthly_budget * 0.8:
        insights.append({
            "type": "warning",
            "title": "Nearing Budget Limit",
            "message": f"You have spent {currency}{total_spent:,.2f} which is {total_spent / monthly_budget * 100:.1f}% of your monthly budget. Only {currency}{monthly_budget - total_spent:,.2f} remaining."
        })
    elif total_spent > 0:
        percent = (total_spent / monthly_budget) * 100
        insights.append({
            "type": "success",
            "title": "On Track with Budget",
            "message": f"Good job! You've used only {percent:.1f}% of your monthly budget. You have {currency}{monthly_budget - total_spent:,.2f} left for the month."
        })
        
    # 2. Category specific budgets
    cursor.execute("""
        SELECT cb.category, cb.budget_amount, SUM(e.amount) as spent
        FROM category_budgets cb
        LEFT JOIN expenses e ON cb.user_id = e.user_id 
            AND cb.category = e.category 
            AND strftime('%Y-%m', e.date) = ?
        WHERE cb.user_id = ?
        GROUP BY cb.category
    """, (current_month_str, user_id))
    
    cat_budgets = cursor.fetchall()
    for cb in cat_budgets:
        cat = cb["category"]
        budget_amt = cb["budget_amount"]
        spent = cb["spent"] if cb["spent"] else 0.0
        
        if spent > budget_amt:
            insights.append({
                "type": "error",
                "title": f"{cat} Budget Exceeded",
                "message": f"Overdraft in {cat}! Spent {currency}{spent:,.2f} against {currency}{budget_amt:,.2f} budgeted."
            })
        elif spent >= budget_amt * 0.8:
            insights.append({
                "type": "warning",
                "title": f"High {cat} Spending",
                "message": f"You have used {spent / budget_amt * 100:.1f}% of your {cat} budget."
            })

    # 3. Largest single expense this month
    cursor.execute("""
        SELECT amount, category, description, date 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        ORDER BY amount DESC 
        LIMIT 1
    """, (user_id, current_month_str))
    largest_row = cursor.fetchone()
    if largest_row:
        insights.append({
            "type": "info",
            "title": "Largest Purchase",
            "message": f"Your single biggest expense this month was {currency}{largest_row['amount']:,.2f} on '{largest_row['description']}' ({largest_row['category']}) on {largest_row['date']}."
        })

    # 4. Weekly Trend Analysis (compare last 7 days vs previous 7 days)
    today = datetime.now().date()
    seven_days_ago = today - timedelta(days=7)
    fourteen_days_ago = today - timedelta(days=14)
    
    cursor.execute("""
        SELECT SUM(amount) as total FROM expenses 
        WHERE user_id = ? AND date BETWEEN ? AND ?
    """, (user_id, seven_days_ago.isoformat(), today.isoformat()))
    last_week_spent = cursor.fetchone()["total"] or 0.0
    
    cursor.execute("""
        SELECT SUM(amount) as total FROM expenses 
        WHERE user_id = ? AND date BETWEEN ? AND ?
    """, (user_id, fourteen_days_ago.isoformat(), (seven_days_ago - timedelta(days=1)).isoformat()))
    prev_week_spent = cursor.fetchone()["total"] or 0.0
    
    if prev_week_spent > 0:
        diff_pct = ((last_week_spent - prev_week_spent) / prev_week_spent) * 100
        if diff_pct > 15:
            insights.append({
                "type": "warning",
                "title": "Spending Spurt",
                "message": f"You spent {currency}{last_week_spent:,.2f} in the last 7 days, which is {diff_pct:.1f}% MORE than the previous 7 days ({currency}{prev_week_spent:,.2f})."
            })
        elif diff_pct < -15:
            insights.append({
                "type": "success",
                "title": "Reduced Spending",
                "message": f"Excellent! Your spending in the last 7 days ({currency}{last_week_spent:,.2f}) is {abs(diff_pct):.1f}% LESS than the prior week."
            })

    # 5. Most frequent category
    cursor.execute("""
        SELECT category, COUNT(*) as count 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY category 
        ORDER BY count DESC 
        LIMIT 1
    """, (user_id, current_month_str))
    freq_row = cursor.fetchone()
    if freq_row and freq_row["count"] >= 3:
        insights.append({
            "type": "info",
            "title": "Frequent Transactions",
            "message": f"You logged purchases in the {freq_row['category']} category {freq_row['count']} times this month. Small, frequent expenses add up quickly!"
        })

    # Fallback default insight if no expenses exist
    if not insights:
        insights.append({
            "type": "success",
            "title": "Welcome Tracker!",
            "message": "Start logging your daily expenses to receive customized AI-driven financial insights here."
        })

    conn.close()
    return insights
