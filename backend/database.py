import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tracker.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        pin_hash TEXT,
        avatar TEXT DEFAULT 'avatar-1',
        monthly_budget REAL DEFAULT 5000.0,
        financial_goal TEXT DEFAULT 'Save 20% of monthly income',
        streak INTEGER DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        theme TEXT DEFAULT 'dark',
        accent_color TEXT DEFAULT 'cyan',
        font_size TEXT DEFAULT 'medium',
        notifications TEXT DEFAULT 'enabled',
        language TEXT DEFAULT 'en'
    );
    """)

    # 2. Expenses Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        time TEXT NOT NULL, -- HH:MM
        payment_method TEXT NOT NULL,
        location TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Category Budgets Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS category_budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        budget_amount REAL NOT NULL,
        UNIQUE(user_id, category),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
