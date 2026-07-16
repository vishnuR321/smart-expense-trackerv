import { store } from "./store.js";

// --- CLIENT-SIDE DATABASE HELPER METHODS ---
const KEYS = {
    USERS: "aether_users",
    EXPENSES: "aether_expenses",
    BUDGETS: "aether_category_budgets"
};

// Retrieve structures from localStorage
function getDBTable(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function setDBTable(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Retrieve active user based on JWT mock token
function getCurrentUser() {
    const token = store.state.token;
    if (!token || !token.startsWith("mock_jwt_token_")) return null;
    const userId = parseInt(token.replace("mock_jwt_token_", ""), 10);
    const users = getDBTable(KEYS.USERS);
    return users.find(u => u.id === userId) || null;
}

function updateDBUser(user) {
    const users = getDBTable(KEYS.USERS);
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
        users[index] = user;
        setDBTable(KEYS.USERS, users);
    }
}

// Native Web Crypto SHA-256 password hashing
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Robust date string parsing helper
function parseDate(dateStr) {
    const formats = [
        /^\d{4}-\d{2}-\d{2}$/,
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,
        /^\d{1,2}-\d{1,2}-\d{4}$/
    ];
    dateStr = dateStr.trim();
    if (formats[0].test(dateStr)) return new Date(dateStr + 'T00:00:00');
    
    if (formats[1].test(dateStr) || formats[2].test(dateStr)) {
        const parts = dateStr.split(/[\/\-]/);
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        return new Date(y, m, d);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
}

function parseAndFormatDate(dStr) {
    const parsed = parseDate(dStr);
    return parsed.toISOString().split('T')[0];
}

function parseAndFormatTime(tStr) {
    tStr = tStr.trim();
    const match12 = tStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
    if (match12) {
        let hrs = parseInt(match12[1], 10);
        const mins = match12[2];
        const ampm = match12[3].toUpperCase();
        if (ampm === "PM" && hrs < 12) hrs += 12;
        if (ampm === "AM" && hrs === 12) hrs = 0;
        return `${String(hrs).padStart(2, '0')}:${mins}`;
    }
    const match24 = tStr.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
    if (match24) {
        const hrs = parseInt(match24[1], 10);
        const mins = match24[2];
        return `${String(hrs).padStart(2, '0')}:${mins}`;
    }
    return new Date().toTimeString().substring(0, 5);
}

// --- CLIENT-SIDE API ENDPOINTS EXPORTER ---
export const api = {
    auth: {
        async login(username, password) {
            // Introduce subtle latency for futuristic loader effect
            await new Promise(r => setTimeout(r, 400));
            const users = getDBTable(KEYS.USERS);
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (!user) throw new Error("Invalid username or credentials");
            
            const hashed = await hashPassword(password);
            if (user.password_hash !== hashed) throw new Error("Invalid username or credentials");
            
            return {
                access_token: `mock_jwt_token_${user.id}`,
                requires_pin: !!user.pin_hash
            };
        },
        async register(username, password) {
            await new Promise(r => setTimeout(r, 450));
            const users = getDBTable(KEYS.USERS);
            
            if (users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
                throw new Error("Username already taken inside ecosystem");
            }
            
            const newUser = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                username: username.trim(),
                password_hash: await hashPassword(password),
                pin_hash: null,
                avatar: `avatar-${Math.floor(Math.random() * 5) + 1}`,
                monthly_budget: 5000.0,
                financial_goal: "Save 20% of monthly income",
                streak: 0,
                currency: "USD",
                theme: "dark",
                accent_color: "cyan",
                font_size: "medium",
                notifications: "enabled",
                language: "en"
            };
            
            users.push(newUser);
            setDBTable(KEYS.USERS, users);
            return { message: "Account registered successfully" };
        },
        async verifyPin(pin) {
            await new Promise(r => setTimeout(r, 200));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            if (!user.pin_hash) return { status: "success", message: "No PIN lock set" };
            
            const hashed = await hashPassword(pin);
            if (user.pin_hash !== hashed) throw new Error("Verification failed: Invalid secure PIN");
            
            return { status: "success", message: "Decrypted successfully" };
        },
        async updatePin(pin) {
            await new Promise(r => setTimeout(r, 300));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            user.pin_hash = pin ? await hashPassword(pin) : null;
            updateDBUser(user);
            return { message: "PIN settings saved successfully" };
        }
    },
    
    user: {
        async getProfile() {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            // Calculate logging streak in-memory
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const uniqueDates = Array.from(new Set(expenses.map(e => e.date)))
                .map(d => parseDate(d))
                .filter(d => !isNaN(d.getTime()))
                .sort((a, b) => b - a); // descending order
            
            let streak = 0;
            if (uniqueDates.length > 0) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                
                const lastLogged = new Date(uniqueDates[0]);
                lastLogged.setHours(0, 0, 0, 0);
                
                if (lastLogged.getTime() === today.getTime() || lastLogged.getTime() === yesterday.getTime()) {
                    streak = 1;
                    for (let i = 0; i < uniqueDates.length - 1; i++) {
                        const current = new Date(uniqueDates[i]);
                        current.setHours(0, 0, 0, 0);
                        const prev = new Date(uniqueDates[i+1]);
                        prev.setHours(0, 0, 0, 0);
                        
                        const diffTime = Math.abs(current - prev);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays === 1) {
                            streak++;
                        } else if (diffDays > 1) {
                            break;
                        }
                    }
                }
            }
            
            user.streak = streak;
            updateDBUser(user);
            
            // Calculate FICO style financial score
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const mSpent = expenses
                .filter(e => e.date.startsWith(currentMonthStr))
                .reduce((sum, e) => sum + e.amount, 0);
            
            let score = 700 + (streak * 10);
            if (mSpent > user.monthly_budget) {
                score -= 80;
            } else if (mSpent > 0 && mSpent < user.monthly_budget * 0.7) {
                score += 50;
            }
            const financial_score = Math.min(Math.max(score, 300), 850);
            
            // Generate earned badges list
            const totalVolume = expenses.reduce((sum, e) => sum + e.amount, 0);
            const badges = [];
            if (expenses.length >= 1) badges.push({ id: "first", title: "Saver Kickstart", desc: "Logged first expense" });
            if (expenses.length >= 10) badges.push({ id: "consistent", title: "Disciplined", desc: "Logged 10+ expenses" });
            if (streak >= 5) badges.push({ id: "streak", title: "Habitual", desc: "5-day logging streak" });
            if (totalVolume > 5000) badges.push({ id: "heavy", title: "Heavy Roller", desc: "Tracked over $5,000" });
            
            return {
                ...user,
                financial_score,
                badges
            };
        },
        async updateProfile(data) {
            await new Promise(r => setTimeout(r, 200));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            Object.keys(data).forEach(key => {
                if (data[key] !== undefined) {
                    user[key] = data[key];
                }
            });
            
            updateDBUser(user);
            return { message: "Profile configurations updated successfully" };
        }
    },
    
    expenses: {
        async getExpenses(filters = {}) {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            let expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            
            // Search Query Filter
            if (filters.q) {
                const query = filters.q.toLowerCase();
                expenses = expenses.filter(e => 
                    e.description.toLowerCase().includes(query) || 
                    (e.notes && e.notes.toLowerCase().includes(query)) ||
                    (e.location && e.location.toLowerCase().includes(query))
                );
            }
            
            if (filters.category) {
                expenses = expenses.filter(e => e.category === filters.category);
            }
            if (filters.payment_method) {
                expenses = expenses.filter(e => e.payment_method === filters.payment_method);
            }
            if (filters.start_date) {
                expenses = expenses.filter(e => e.date >= filters.start_date);
            }
            if (filters.end_date) {
                expenses = expenses.filter(e => e.date <= filters.end_date);
            }
            
            // Sorting Logic
            const sortBy = filters.sort_by || "date";
            const sortOrder = filters.sort_order || "desc";
            
            expenses.sort((a, b) => {
                let comparison = 0;
                if (sortBy === "amount") {
                    comparison = a.amount - b.amount;
                } else if (sortBy === "date") {
                    comparison = parseDate(a.date) - parseDate(b.date);
                    if (comparison === 0) {
                        comparison = a.time.localeCompare(b.time);
                    }
                } else {
                    comparison = (a.id || 0) - (b.id || 0);
                }
                return sortOrder === "asc" ? comparison : -comparison;
            });
            
            // In-Memory Pagination
            const page = filters.page || 1;
            const limit = filters.limit || 10;
            const offset = (page - 1) * limit;
            const paginatedExpenses = expenses.slice(offset, offset + limit);
            
            return {
                expenses: paginatedExpenses,
                total_count: expenses.length
            };
        },
        async createExpense(data) {
            await new Promise(r => setTimeout(r, 300));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const expenses = getDBTable(KEYS.EXPENSES);
            const newExpense = {
                id: Date.now() + Math.floor(Math.random() * 100),
                user_id: user.id,
                amount: parseFloat(data.amount),
                category: data.category,
                description: data.description,
                date: parseAndFormatDate(data.date),
                time: parseAndFormatTime(data.time),
                payment_method: data.payment_method,
                location: data.location || "",
                notes: data.notes || ""
            };
            
            expenses.push(newExpense);
            setDBTable(KEYS.EXPENSES, expenses);
            
            // Calculate category budget notifications triggers
            const currentMonthStr = newExpense.date.slice(0, 7);
            const catSpent = expenses
                .filter(e => e.user_id === user.id && e.category === newExpense.category && e.date.startsWith(currentMonthStr))
                .reduce((sum, e) => sum + e.amount, 0);
                
            const budgets = getDBTable(KEYS.BUDGETS).filter(b => b.user_id === user.id);
            const catBudget = budgets.find(b => b.category === newExpense.category);
            
            let cat_warning = null;
            if (catBudget) {
                const limit = catBudget.budget_amount;
                if (catSpent > limit) {
                    cat_warning = `Budget exceeded for ${newExpense.category}! Spent: ${catSpent.toFixed(2)} / ${limit.toFixed(2)}`;
                } else if (catSpent >= limit * 0.8) {
                    cat_warning = `Budget warning for ${newExpense.category}: used ${(catSpent / limit * 100).toFixed(1)}%`;
                }
            }
            
            return {
                message: "Expense saved successfully",
                expense_id: newExpense.id,
                category_warning: cat_warning
            };
        },
        async updateExpense(id, data) {
            await new Promise(r => setTimeout(r, 200));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const expenses = getDBTable(KEYS.EXPENSES);
            const index = expenses.findIndex(e => e.id === parseInt(id, 10) && e.user_id === user.id);
            if (index === -1) throw new Error("Record not found or unauthorized");
            
            expenses[index] = {
                ...expenses[index],
                amount: parseFloat(data.amount),
                category: data.category,
                description: data.description,
                date: parseAndFormatDate(data.date),
                time: parseAndFormatTime(data.time),
                payment_method: data.payment_method,
                location: data.location || "",
                notes: data.notes || ""
            };
            
            setDBTable(KEYS.EXPENSES, expenses);
            return { message: "Expense modified successfully" };
        },
        async deleteExpense(id) {
            await new Promise(r => setTimeout(r, 150));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            let expenses = getDBTable(KEYS.EXPENSES);
            const initialCount = expenses.length;
            expenses = expenses.filter(e => !(e.id === parseInt(id, 10) && e.user_id === user.id));
            
            if (expenses.length === initialCount) throw new Error("Record not found or unauthorized");
            setDBTable(KEYS.EXPENSES, expenses);
            return { message: "Expense removed successfully" };
        }
    },
    
    budgets: {
        async getCategoryBudgets() {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const budgets = getDBTable(KEYS.BUDGETS).filter(b => b.user_id === user.id);
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            
            return budgets.map(b => {
                const spent = expenses
                    .filter(e => e.category === b.category && e.date.startsWith(currentMonthStr))
                    .reduce((sum, e) => sum + e.amount, 0);
                return {
                    id: b.id,
                    category: b.category,
                    budget_amount: b.budget_amount,
                    spent
                };
            });
        },
        async setCategoryBudget(category, budget_amount) {
            await new Promise(r => setTimeout(r, 200));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const budgets = getDBTable(KEYS.BUDGETS);
            const index = budgets.findIndex(b => b.user_id === user.id && b.category === category);
            
            if (index !== -1) {
                budgets[index].budget_amount = parseFloat(budget_amount);
            } else {
                budgets.push({
                    id: Date.now() + Math.floor(Math.random() * 100),
                    user_id: user.id,
                    category,
                    budget_amount: parseFloat(budget_amount)
                });
            }
            
            setDBTable(KEYS.BUDGETS, budgets);
            return { message: "Budget limit adjusted successfully" };
        },
        async deleteCategoryBudget(category) {
            await new Promise(r => setTimeout(r, 150));
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            let budgets = getDBTable(KEYS.BUDGETS);
            budgets = budgets.filter(b => !(b.user_id === user.id && b.category === category));
            
            setDBTable(KEYS.BUDGETS, budgets);
            return { message: "Category limit removed" };
        }
    },
    
    analytics: {
        async getDashboardData() {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const todayStr = new Date().toISOString().split('T')[0];
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            
            const today_spent = expenses
                .filter(e => e.date === todayStr)
                .reduce((sum, e) => sum + e.amount, 0);
                
            const month_spent = expenses
                .filter(e => e.date.startsWith(currentMonthStr))
                .reduce((sum, e) => sum + e.amount, 0);
                
            const total_spent = expenses
                .reduce((sum, e) => sum + e.amount, 0);
                
            const highest_expense = expenses
                .reduce((max, e) => e.amount > max ? e.amount : max, 0.0);
                
            // Calculate Daily Average (month context)
            const daysMap = {};
            expenses.filter(e => e.date.startsWith(currentMonthStr)).forEach(e => {
                daysMap[e.date] = (daysMap[e.date] || 0) + e.amount;
            });
            const daysCount = Object.keys(daysMap).length;
            const avg_daily = daysCount > 0 ? month_spent / daysCount : 0.0;
            
            // Recent Transactions (last 5)
            const recent = [...expenses]
                .sort((a, b) => {
                    const c = parseDate(a.date) - parseDate(b.date);
                    return c === 0 ? a.time.localeCompare(b.time) : c;
                })
                .reverse()
                .slice(0, 5);
                
            let savings_indicator = 0.0;
            if (user.monthly_budget > 0) {
                savings_indicator = Math.max(0.0, ((user.monthly_budget - month_spent) / user.monthly_budget) * 100);
            }
            
            return {
                monthly_budget: user.monthly_budget,
                currency: user.currency,
                today_spent,
                month_spent,
                total_spent,
                highest_expense,
                avg_daily,
                recent_transactions: recent,
                savings_indicator
            };
        },
        async getChartData() {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentMonthStr));
            
            // 1. Spending by Category
            const catMap = {};
            currentMonthExpenses.forEach(e => {
                catMap[e.category] = (catMap[e.category] || 0) + e.amount;
            });
            const category_distribution = Object.keys(catMap).map(cat => ({
                category: cat,
                total: catMap[cat]
            })).sort((a, b) => b.total - a.total);
            
            // 2. Spending Trend (Daily Aggregate this month)
            const trendMap = {};
            currentMonthExpenses.forEach(e => {
                trendMap[e.date] = (trendMap[e.date] || 0) + e.amount;
            });
            const spending_trend = Object.keys(trendMap).map(date => ({
                date,
                total: trendMap[date]
            })).sort((a, b) => a.date.localeCompare(b.date));
            
            // 3. Monthly total comparison (past 6 months)
            const monthMap = {};
            expenses.forEach(e => {
                const month = e.date.slice(0, 7);
                monthMap[month] = (monthMap[month] || 0) + e.amount;
            });
            
            const months = [];
            const d = new Date();
            for (let i = 5; i >= 0; i--) {
                const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
                months.push(temp.toISOString().slice(0, 7));
            }
            const monthly_comparison = months.map(m => ({
                month: m,
                total: monthMap[m] || 0.0
            }));
            
            // 4. Payment Method Allocation
            const payMap = {};
            currentMonthExpenses.forEach(e => {
                payMap[e.payment_method] = (payMap[e.payment_method] || 0) + e.amount;
            });
            const payment_method_distribution = Object.keys(payMap).map(pm => ({
                payment_method: pm,
                total: payMap[pm]
            }));
            
            return {
                category_distribution,
                spending_trend,
                monthly_comparison,
                payment_method_distribution
            };
        },
        async getInsights() {
            const user = getCurrentUser();
            if (!user) throw new Error("Unauthorized access request");
            
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentMonthStr));
            
            const symbolMap = { "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CAD": "C$" };
            const currency = symbolMap[user.currency] || user.currency;
            
            const insights = [];
            
            // 1. Budget Overall
            const monthly_budget = user.monthly_budget;
            const total_spent = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
            
            if (total_spent > monthly_budget) {
                insights.push({
                    type: "error",
                    title: "Budget Exceeded",
                    message: `You have exceeded your total monthly budget of ${currency}${monthly_budget.toLocaleString(undefined, { minimumFractionDigits: 2 })} by ${currency}${(total_spent - monthly_budget).toLocaleString(undefined, { minimumFractionDigits: 2 })}! Consider freezing non-essential spending.`
                });
            } else if (total_spent >= monthly_budget * 0.8) {
                insights.push({
                    type: "warning",
                    title: "Nearing Budget Limit",
                    message: `You have spent ${currency}${total_spent.toLocaleString(undefined, { minimumFractionDigits: 2 })} which is ${(total_spent / monthly_budget * 100).toFixed(1)}% of your monthly budget. Only ${currency}${(monthly_budget - total_spent).toLocaleString(undefined, { minimumFractionDigits: 2 })} remaining.`
                });
            } else if (total_spent > 0) {
                insights.push({
                    type: "success",
                    title: "On Track with Budget",
                    message: `Good job! You've used only ${(total_spent / monthly_budget * 100).toFixed(1)}% of your monthly budget. You have ${currency}${(monthly_budget - total_spent).toLocaleString(undefined, { minimumFractionDigits: 2 })} left for the month.`
                });
            }
            
            // 2. Category Budgets warnings
            const budgets = getDBTable(KEYS.BUDGETS).filter(b => b.user_id === user.id);
            budgets.forEach(b => {
                const spent = currentMonthExpenses
                    .filter(e => e.category === b.category)
                    .reduce((sum, e) => sum + e.amount, 0);
                
                if (spent > b.budget_amount) {
                    insights.push({
                        type: "error",
                        title: `${b.category} Budget Exceeded`,
                        message: `Overdraft in ${b.category}! Spent ${currency}${spent.toLocaleString(undefined, { minimumFractionDigits: 2 })} against ${currency}${b.budget_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} budgeted.`
                    });
                } else if (spent >= b.budget_amount * 0.8) {
                    insights.push({
                        type: "warning",
                        title: `High ${b.category} Spending`,
                        message: `You have used ${(spent / b.budget_amount * 100).toFixed(1)}% of your ${b.category} budget.`
                    });
                }
            });
            
            // 3. Largest single expense
            if (currentMonthExpenses.length > 0) {
                const largest = currentMonthExpenses.reduce((max, e) => e.amount > max.amount ? e : max, currentMonthExpenses[0]);
                insights.push({
                    type: "info",
                    title: "Largest Purchase",
                    message: `Your single biggest expense this month was ${currency}${largest.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} on '${largest.description}' (${largest.category}) on ${largest.date}.`
                });
            }
            
            // 4. Weekly Trend Analysis
            const today = new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(today.getDate() - 14);
            
            const lastWeekSpent = expenses
                .filter(e => {
                    const d = parseDate(e.date);
                    return d >= sevenDaysAgo && d <= today;
                })
                .reduce((sum, e) => sum + e.amount, 0);
                
            const prevWeekSpent = expenses
                .filter(e => {
                    const d = parseDate(e.date);
                    return d >= fourteenDaysAgo && d < sevenDaysAgo;
                })
                .reduce((sum, e) => sum + e.amount, 0);
                
            if (prevWeekSpent > 0) {
                const diff_pct = ((lastWeekSpent - prevWeekSpent) / prevWeekSpent) * 100;
                if (diff_pct > 15) {
                    insights.push({
                        type: "warning",
                        title: "Spending Spurt",
                        message: `You spent ${currency}${lastWeekSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })} in the last 7 days, which is ${diff_pct.toFixed(1)}% MORE than the previous 7 days (${currency}${prevWeekSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`
                    });
                } else if (diff_pct < -15) {
                    insights.push({
                        type: "success",
                        title: "Reduced Spending",
                        message: `Excellent! Your spending in the last 7 days (${currency}${lastWeekSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}) is ${Math.abs(diff_pct).toFixed(1)}% LESS than the prior week.`
                    });
                }
            }
            
            // 5. Frequent Category
            const freqMap = {};
            currentMonthExpenses.forEach(e => {
                freqMap[e.category] = (freqMap[e.category] || 0) + 1;
            });
            const categoriesSorted = Object.keys(freqMap).map(cat => ({
                category: cat,
                count: freqMap[cat]
            })).sort((a, b) => b.count - a.count);
            
            if (categoriesSorted.length > 0 && categoriesSorted[0].count >= 3) {
                insights.push({
                    type: "info",
                    title: "Frequent Transactions",
                    message: `You logged purchases in the ${categoriesSorted[0].category} category ${categoriesSorted[0].count} times this month. Small, frequent expenses add up quickly!`
                });
            }
            
            if (insights.length === 0) {
                insights.push({
                    type: "success",
                    title: "Welcome Tracker!",
                    message: "Start logging your daily expenses to receive customized AI-driven financial insights here."
                });
            }
            
            return insights;
        }
    },
    
    reports: {
        async downloadCSV() {
            const user = getCurrentUser();
            if (!user) return;
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            
            let csv = "Amount,Category,Description,Date,Time,Payment Method,Location,Notes\n";
            expenses.forEach(e => {
                const row = [
                    e.amount,
                    e.category,
                    `"${e.description.replace(/"/g, '""')}"`,
                    e.date,
                    e.time,
                    e.payment_method,
                    `"${(e.location || "").replace(/"/g, '""')}"`,
                    `"${(e.notes || "").replace(/"/g, '""')}"`
                ];
                csv += row.join(",") + "\n";
            });
            
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            downloadBlob(blob, "expenses_export.csv");
        },
        async uploadCSV(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const csvContent = e.target.result;
                        const user = getCurrentUser();
                        if (!user) return reject(new Error("Unauthorized"));
                        
                        // Parse CSV rows safely
                        const lines = csvContent.split(/\r?\n/).map(line => {
                            const result = [];
                            let current = "";
                            let inQuotes = false;
                            for (let i = 0; i < line.length; i++) {
                                const char = line[i];
                                if (char === '"') {
                                    inQuotes = !inQuotes;
                                } else if (char === ',' && !inQuotes) {
                                    result.push(current);
                                    current = "";
                                } else {
                                    current += char;
                                }
                            }
                            result.push(current);
                            return result.map(s => s.trim().replace(/^"|"$/g, ''));
                        });
                        
                        const validCategories = new Set([
                            "Food", "Transport", "Shopping", "Entertainment", "Recharge", 
                            "Medical", "Bills", "Education", "Travel", "Fuel", "Grocery", 
                            "Investment", "Others"
                        ]);
                        
                        const importedExpenses = [];
                        let importedCount = 0;
                        
                        for (let i = 1; i < lines.length; i++) {
                            const row = lines[i];
                            if (!row || row.length < 6) continue;
                            
                            try {
                                const amount = parseFloat(row[0]);
                                if (isNaN(amount)) continue;
                                
                                let category = row[1].charAt(0).toUpperCase() + row[1].slice(1).toLowerCase();
                                if (!validCategories.has(category)) category = "Others";
                                
                                const description = row[2] || "Imported Expense";
                                const date = parseAndFormatDate(row[3]);
                                const time = parseAndFormatTime(row[4]);
                                const payment_method = row[5] || "Cash";
                                const location = row[6] || "";
                                const notes = row[7] || "";
                                
                                importedExpenses.push({
                                    id: Date.now() + i + Math.floor(Math.random() * 100),
                                    user_id: user.id,
                                    amount,
                                    category,
                                    description,
                                    date,
                                    time,
                                    payment_method,
                                    location,
                                    notes
                                });
                                importedCount++;
                            } catch (err) {
                                continue;
                            }
                        }
                        
                        if (importedExpenses.length > 0) {
                            const allExpenses = getDBTable(KEYS.EXPENSES);
                            setDBTable(KEYS.EXPENSES, [...allExpenses, ...importedExpenses]);
                        }
                        
                        resolve({ message: `Successfully imported ${importedCount} transactions` });
                    } catch (err) {
                        reject(new Error("Failed to process CSV layout"));
                    }
                };
                reader.onerror = () => reject(new Error("File read error"));
                reader.readAsText(file);
            });
        },
        async downloadBackup() {
            const user = getCurrentUser();
            if (!user) return;
            const expenses = getDBTable(KEYS.EXPENSES).filter(e => e.user_id === user.id);
            const budgets = getDBTable(KEYS.BUDGETS).filter(b => b.user_id === user.id);
            
            const backup = {
                username: user.username,
                monthly_budget: user.monthly_budget,
                financial_goal: user.financial_goal,
                currency: user.currency,
                theme: user.theme,
                accent_color: user.accent_color,
                font_size: user.font_size,
                notifications: user.notifications,
                language: user.language,
                expenses: expenses.map(e => ({
                    amount: e.amount,
                    category: e.category,
                    description: e.description,
                    date: e.date,
                    time: e.time,
                    payment_method: e.payment_method,
                    location: e.location,
                    notes: e.notes
                })),
                category_budgets: budgets.map(b => ({
                    category: b.category,
                    budget_amount: b.budget_amount
                }))
            };
            
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            downloadBlob(blob, "aether_ledger_backup.json");
        },
        async uploadBackup(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        const user = getCurrentUser();
                        if (!user) return reject(new Error("Unauthorized"));
                        
                        user.monthly_budget = data.monthly_budget !== undefined ? data.monthly_budget : user.monthly_budget;
                        user.financial_goal = data.financial_goal !== undefined ? data.financial_goal : user.financial_goal;
                        user.currency = data.currency !== undefined ? data.currency : user.currency;
                        user.theme = data.theme !== undefined ? data.theme : user.theme;
                        user.accent_color = data.accent_color !== undefined ? data.accent_color : user.accent_color;
                        user.font_size = data.font_size !== undefined ? data.font_size : user.font_size;
                        user.notifications = data.notifications !== undefined ? data.notifications : user.notifications;
                        user.language = data.language !== undefined ? data.language : user.language;
                        
                        updateDBUser(user);
                        
                        const otherExpenses = getDBTable(KEYS.EXPENSES).filter(ex => ex.user_id !== user.id);
                        const importedExpenses = (data.expenses || []).map((ex, idx) => ({
                            id: Date.now() + idx + Math.floor(Math.random() * 1000),
                            user_id: user.id,
                            amount: parseFloat(ex.amount),
                            category: ex.category,
                            description: ex.description,
                            date: parseAndFormatDate(ex.date),
                            time: parseAndFormatTime(ex.time),
                            payment_method: ex.payment_method,
                            location: ex.location || "",
                            notes: ex.notes || ""
                        }));
                        setDBTable(KEYS.EXPENSES, [...otherExpenses, ...importedExpenses]);
                        
                        const otherBudgets = getDBTable(KEYS.BUDGETS).filter(b => b.user_id !== user.id);
                        const importedBudgets = (data.category_budgets || []).map((b, idx) => ({
                            id: Date.now() + idx + Math.floor(Math.random() * 100),
                            user_id: user.id,
                            category: b.category,
                            budget_amount: parseFloat(b.budget_amount)
                        }));
                        setDBTable(KEYS.BUDGETS, [...otherBudgets, ...importedBudgets]);
                        
                        resolve({ message: "Backup successfully imported into browser" });
                    } catch (err) {
                        reject(new Error("Failed to parse JSON ledger structure"));
                    }
                };
                reader.onerror = () => reject(new Error("File read error"));
                reader.readAsText(file);
            });
        },
        getPDFReportURL(monthStr) {
            const user = getCurrentUser();
            if (!user) return "";
            
            const symbolMap = { "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CAD": "C$" };
            const currency_symbol = symbolMap[user.currency] || user.currency;
            
            const expenses = getDBTable(KEYS.EXPENSES)
                .filter(e => e.user_id === user.id && e.date.startsWith(monthStr))
                .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
                
            const catMap = {};
            expenses.forEach(e => {
                if (!catMap[e.category]) {
                    catMap[e.category] = { total: 0, count: 0 };
                }
                catMap[e.category].total += e.amount;
                catMap[e.category].count += 1;
            });
            const categories = Object.keys(catMap).map(c => ({
                category: c,
                total: catMap[c].total,
                count: catMap[c].count
            })).sort((a, b) => b.total - a.total);
            
            const total_spent = expenses.reduce((sum, e) => sum + e.amount, 0);
            const avg_daily = total_spent / 30.0;
            
            // Build Printable HTML Statement
            let tableCats = "";
            categories.forEach(c => {
                const pct = total_spent > 0 ? (c.total / total_spent * 100) : 0;
                tableCats += `
                    <tr>
                        <td>${c.category}</td>
                        <td>${c.count}</td>
                        <td class="amount">${currency_symbol}${c.total.toFixed(2)}</td>
                        <td style="text-align: right;">${pct.toFixed(1)}%</td>
                    </tr>
                `;
            });
            
            let tableExps = "";
            expenses.forEach(e => {
                tableExps += `
                    <tr>
                        <td>${e.date}</td>
                        <td>${e.time}</td>
                        <td>${e.category}</td>
                        <td>${e.description}</td>
                        <td>${e.payment_method}</td>
                        <td class="amount">${currency_symbol}${e.amount.toFixed(2)}</td>
                    </tr>
                `;
            });
            
            const datePrinted = new Date().toLocaleString();
            
            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Financial Report - ${monthStr}</title>
    <style>
        body {
            font-family: 'Inter', system-ui, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 24px;
            font-weight: 800;
            color: #0ea5e9;
        }
        .title {
            font-size: 28px;
            font-weight: 700;
            margin: 0;
        }
        .meta {
            color: #64748b;
            font-size: 14px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
        }
        .stat-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            margin-bottom: 8px;
        }
        .stat-value {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }
        .section-title {
            font-size: 18px;
            font-weight: 700;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 8px;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        th {
            background: #f1f5f9;
            text-align: left;
            padding: 12px;
            font-weight: 600;
            font-size: 14px;
            border-bottom: 2px solid #e2e8f0;
        }
        td {
            padding: 12px;
            font-size: 14px;
            border-bottom: 1px solid #e2e8f0;
        }
        tr:last-child td {
            border-bottom: none;
        }
        .amount {
            text-align: right;
            font-weight: 600;
        }
        .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
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
            <div class="meta">Period: ${monthStr} | Generated for: ${user.username}</div>
        </div>
    </div>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Spent</div>
            <div class="stat-value">${currency_symbol}${total_spent.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Monthly Budget</div>
            <div class="stat-value">${currency_symbol}${user.monthly_budget.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Transactions</div>
            <div class="stat-value">${expenses.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Daily Avg</div>
            <div class="stat-value">${currency_symbol}${avg_daily.toFixed(2)}</div>
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
            ${tableCats || '<tr><td colspan="4" style="text-align:center;color:#64748b;">No category aggregates</td></tr>'}
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
            ${tableExps || '<tr><td colspan="6" style="text-align:center;color:#64748b;">No logged transactions</td></tr>'}
        </tbody>
    </table>

    <div class="footer">
        This document is an automatic financial summary generated by AetherFinance Smart Expense Tracker on ${datePrinted}.
    </div>

    <div class="no-print" style="margin-top: 30px; text-align: center;">
        <button onclick="window.print()" style="background: #0ea5e9; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);">
            Print Report / Save as PDF
        </button>
    </div>
</body>
</html>`;
            
            const blob = new Blob([html], { type: "text/html" });
            return URL.createObjectURL(blob);
        }
    }
};

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}
