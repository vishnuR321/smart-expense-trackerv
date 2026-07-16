import csv
import json
import io
from datetime import datetime
from database import get_db_connection

def export_expenses_csv(user_id: int) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT amount, category, description, date, time, payment_method, location, notes 
        FROM expenses 
        WHERE user_id = ? 
        ORDER BY date DESC, time DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Amount", "Category", "Description", "Date", "Time", "Payment Method", "Location", "Notes"])
    
    for row in rows:
        writer.writerow([
            row["amount"],
            row["category"],
            row["description"],
            row["date"],
            row["time"],
            row["payment_method"],
            row["location"] or "",
            row["notes"] or ""
        ])
    
    return output.getvalue()

def import_expenses_csv(user_id: int, csv_content: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    reader = csv.reader(io.StringIO(csv_content))
    header = next(reader, None)  # Skip header
    
    # Simple validation mapping
    valid_categories = {
        "Food", "Transport", "Shopping", "Entertainment", "Recharge", 
        "Medical", "Bills", "Education", "Travel", "Fuel", "Grocery", 
        "Investment", "Others"
    }
    
    imported_count = 0
    for row in reader:
        if not row or len(row) < 6:
            continue
        try:
            amount = float(row[0])
            category = row[1].strip().capitalize()
            if category not in valid_categories:
                category = "Others"
            description = row[2].strip() or "Imported Expense"
            
            # Robust Date Parsing & Formatting to YYYY-MM-DD
            date_str = row[3].strip()
            parsed_date = None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    parsed_date = datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
            if not parsed_date:
                parsed_date = datetime.now().strftime("%Y-%m-%d")
            
            # Robust Time Parsing & Formatting to HH:MM
            time_str = row[4].strip()
            parsed_time = None
            for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p"):
                try:
                    parsed_time = datetime.strptime(time_str, fmt).strftime("%H:%M")
                    break
                except ValueError:
                    continue
            if not parsed_time:
                parsed_time = datetime.now().strftime("%H:%M")
                
            payment_method = row[5].strip() or "Cash"
            location = row[6].strip() if len(row) > 6 else ""
            notes = row[7].strip() if len(row) > 7 else ""
            
            cursor.execute("""
                INSERT INTO expenses (user_id, amount, category, description, date, time, payment_method, location, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, amount, category, description, parsed_date, parsed_time, payment_method, location, notes))
            imported_count += 1
        except Exception as e:
            # Skip invalid rows silently
            continue
            
    conn.commit()
    conn.close()
    return imported_count

def generate_json_backup(user_id: int) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch user details (excluding credentials)
    cursor.execute("""
        SELECT username, monthly_budget, financial_goal, currency, theme, accent_color, font_size, notifications, language 
        FROM users WHERE id = ?
    """, (user_id,))
    user_row = cursor.fetchone()
    
    user_data = dict(user_row) if user_row else {}
    
    # Fetch expenses
    cursor.execute("""
        SELECT amount, category, description, date, time, payment_method, location, notes 
        FROM expenses WHERE user_id = ?
    """, (user_id,))
    expenses = [dict(r) for r in cursor.fetchall()]
    
    # Fetch category budgets
    cursor.execute("""
        SELECT category, budget_amount 
        FROM category_budgets WHERE user_id = ?
    """, (user_id,))
    category_budgets = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    backup_data = {
        "backup_date": datetime.now().isoformat(),
        "user": user_data,
        "expenses": expenses,
        "category_budgets": category_budgets
    }
    
    return json.dumps(backup_data, indent=2)

def restore_json_backup(user_id: int, backup_json: str) -> bool:
    try:
        data = json.loads(backup_json)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Restore user preferences if in backup
        if "user" in data:
            u = data["user"]
            cursor.execute("""
                UPDATE users SET 
                    monthly_budget = ?, financial_goal = ?, currency = ?, 
                    theme = ?, accent_color = ?, font_size = ?, notifications = ?, language = ?
                WHERE id = ?
            """, (
                u.get("monthly_budget", 5000.0),
                u.get("financial_goal", ""),
                u.get("currency", "USD"),
                u.get("theme", "dark"),
                u.get("accent_color", "cyan"),
                u.get("font_size", "medium"),
                u.get("notifications", "enabled"),
                u.get("language", "en"),
                user_id
            ))
            
        # Restore expenses
        if "expenses" in data:
            # Delete current expenses first
            cursor.execute("DELETE FROM expenses WHERE user_id = ?", (user_id,))
            for exp in data["expenses"]:
                cursor.execute("""
                    INSERT INTO expenses (user_id, amount, category, description, date, time, payment_method, location, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    exp["amount"],
                    exp["category"],
                    exp["description"],
                    exp["date"],
                    exp["time"],
                    exp["payment_method"],
                    exp.get("location"),
                    exp.get("notes")
                ))
                
        # Restore category budgets
        if "category_budgets" in data:
            cursor.execute("DELETE FROM category_budgets WHERE user_id = ?", (user_id,))
            for cb in data["category_budgets"]:
                cursor.execute("""
                    INSERT OR REPLACE INTO category_budgets (user_id, category, budget_amount)
                    VALUES (?, ?, ?)
                """, (
                    user_id,
                    cb["category"],
                    cb["budget_amount"]
                ))
                
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print("Restore failed:", e)
        return False

def generate_print_report_html(user_id: int, month_str: str) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # User Profile Info
    cursor.execute("SELECT username, currency, monthly_budget FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    username = user_row["username"] if user_row else "User"
    currency = user_row["currency"] if user_row else "USD"
    monthly_budget = user_row["monthly_budget"] if user_row else 5000.0
    
    symbol_map = {"USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CAD": "C$"}
    currency_symbol = symbol_map.get(currency, currency)
    
    # Expenses for month
    cursor.execute("""
        SELECT amount, category, description, date, time, payment_method 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        ORDER BY date DESC, time DESC
    """, (user_id, month_str))
    expenses = cursor.fetchall()
    
    # Category totals
    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as count
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (user_id, month_str))
    categories = cursor.fetchall()
    
    conn.close()
    
    total_spent = sum(e["amount"] for e in expenses)
    avg_daily = total_spent / 30.0  # approximate
    expense_count = len(expenses)
    
    # Build HTML string
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Financial Report - {month_str}</title>
    <style>
        body {{
            font-family: 'Inter', system-ui, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            line-height: 1.5;
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 24px;
            font-weight: 800;
            color: #0ea5e9;
        }}
        .title {{
            font-size: 28px;
            font-weight: 700;
            margin: 0;
        }}
        .meta {{
            color: #64748b;
            font-size: 14px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 40px;
        }}
        .stat-card {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
        }}
        .stat-label {{
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            margin-bottom: 8px;
        }}
        .stat-value {{
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }}
        .section-title {{
            font-size: 18px;
            font-weight: 700;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 8px;
            margin-top: 30px;
            margin-bottom: 15px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }}
        th {{
            background: #f1f5f9;
            text-align: left;
            padding: 12px;
            font-weight: 600;
            font-size: 14px;
            border-bottom: 2px solid #e2e8f0;
        }}
        td {{
            padding: 12px;
            font-size: 14px;
            border-bottom: 1px solid #e2e8f0;
        }}
        tr:last-child td {{
            border-bottom: none;
        }}
        .amount {{
            text-align: right;
            font-weight: 600;
        }}
        .footer {{
            margin-top: 50px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }}
        @media print {{
            body {{ padding: 20px; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">AetherFinance</div>
            <div class="meta">Smart Expense Tracker Report</div>
        </div>
        <div style="text-align: right;">
            <div class="title">Monthly Statement</div>
            <div class="meta">Period: {month_str} | Generated for: {username}</div>
        </div>
    </div>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Spent</div>
            <div class="stat-value">{currency_symbol}{total_spent:,.2f}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Monthly Budget</div>
            <div class="stat-value">{currency_symbol}{monthly_budget:,.2f}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Transactions</div>
            <div class="stat-value">{expense_count}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Daily Avg</div>
            <div class="stat-value">{currency_symbol}{avg_daily:,.2f}</div>
        </div>
    </div>

    <div class="section-title">Spending by Category</div>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th>Transaction Count</th>
                <th style="text-align: right;">Total Amount</th>
                <th style="text-align: right;">Percentage</th>
            </tr>
        </thead>
        <tbody>
    """
    
    for cat in categories:
        pct = (cat["total"] / total_spent * 100) if total_spent > 0 else 0
        html += f"""
            <tr>
                <td>{cat["category"]}</td>
                <td>{cat["count"]}</td>
                <td class="amount">{currency_symbol}{cat["total"]:,.2f}</td>
                <td style="text-align: right;">{pct:.1f}%</td>
            </tr>
        """
        
    html += """
        </tbody>
    </table>

    <div class="section-title">Transaction History</div>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Category</th>
                <th>Description</th>
                <th>Payment Method</th>
                <th style="text-align: right;">Amount</th>
            </tr>
        </thead>
        <tbody>
    """
    
    for exp in expenses:
        html += f"""
            <tr>
                <td>{exp["date"]}</td>
                <td>{exp["time"]}</td>
                <td>{exp["category"]}</td>
                <td>{exp["description"]}</td>
                <td>{exp["payment_method"]}</td>
                <td class="amount">{currency_symbol}{exp["amount"]:,.2f}</td>
            </tr>
        """
        
    html += f"""
        </tbody>
    </table>

    <div class="footer">
        This document is an automatic financial summary generated by AetherFinance Smart Expense Tracker on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}.
    </div>

    <div class="no-print" style="margin-top: 30px; text-align: center;">
        <button onclick="window.print()" style="background: #0ea5e9; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);">
            Print Report / Save as PDF
        </button>
    </div>
</body>
</html>
"""
    return html
