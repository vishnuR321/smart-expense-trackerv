import { store } from "./store.js";
import { api } from "./api.js";
import { ui } from "./components.js";

const currencySymbols = {
    "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CAD": "C$"
};

// Store active chart instances to prevent canvas reuse issues
let activeCharts = {};

function destroyActiveCharts() {
    Object.keys(activeCharts).forEach(key => {
        if (activeCharts[key]) {
            activeCharts[key].destroy();
        }
    });
    activeCharts = {};
}

export const views = {
    dashboard: {
        async render(container) {
            container.innerHTML = `
                <!-- Stats Row -->
                <div class="stats-grid">
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Today's Outflow</span>
                            <div class="stat-icon-wrapper primary"><i data-lucide="sun"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="dash-today-spent">...</div>
                            <div class="stat-footer">Today's aggregate transactions</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Monthly Outflow</span>
                            <div class="stat-icon-wrapper success"><i data-lucide="calendar"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="dash-month-spent">...</div>
                            <div class="stat-footer" id="dash-budget-info">...</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Lifetime Logged</span>
                            <div class="stat-icon-wrapper warning"><i data-lucide="activity"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="dash-total-spent">...</div>
                            <div class="stat-footer">Cumulative amount tracked</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Peak Purchase</span>
                            <div class="stat-icon-wrapper danger"><i data-lucide="trending-up"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="dash-highest-spent">...</div>
                            <div class="stat-footer">Largest single transaction</div>
                        </div>
                    </div>
                </div>

                <!-- Middle Section: Trend Graph & Budget progress -->
                <div class="dashboard-middle-grid">
                    <div class="glass-card chart-card">
                        <div class="chart-header">
                            <h3>Spending Trend</h3>
                            <span class="text-secondary" style="font-size:12px;">Daily aggregate this month</span>
                        </div>
                        <div class="chart-canvas-container">
                            <canvas id="trend-chart"></canvas>
                        </div>
                    </div>
                    
                    <div class="glass-card chart-card budget-panel">
                        <div class="budget-header">
                            <h3>Budget Planner</h3>
                            <button id="dash-set-budget-btn" class="btn btn-secondary btn-compact"><i data-lucide="edit"></i> Adjust</button>
                        </div>
                        <div class="budget-circle-container">
                            <svg class="budget-circle">
                                <defs>
                                    <linearGradient id="cyan-purple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#0ea5e9" />
                                        <stop offset="100%" stop-color="#8b5cf6" />
                                    </linearGradient>
                                </defs>
                                <circle class="budget-circle-bg" cx="80" cy="80" r="70"></circle>
                                <circle class="budget-circle-progress" id="budget-ring" cx="80" cy="80" r="70" stroke-dasharray="440" stroke-dashoffset="440"></circle>
                            </svg>
                            <div class="budget-circle-text">
                                <span class="budget-circle-percent" id="budget-percentage">0%</span>
                                <span class="budget-circle-label">Used</span>
                            </div>
                        </div>
                        
                        <div class="budget-status-list" id="budget-status-summary">
                            <!-- Category progress injected here -->
                            <div class="skeleton" style="height:12px; border-radius:4px; margin-bottom:8px;"></div>
                            <div class="skeleton" style="height:12px; border-radius:4px; margin-bottom:8px;"></div>
                        </div>
                    </div>
                </div>

                <!-- Bottom Section: Recent transactions & AI insights -->
                <div class="dashboard-bottom-grid">
                    <div class="glass-card transactions-panel">
                        <div class="panel-header">
                            <h3>Recent Transactions</h3>
                            <button class="btn btn-secondary btn-compact nav-btn" data-target-view="expenses">View All</button>
                        </div>
                        <div class="transactions-list" id="dash-recent-list">
                            <!-- Injected transactions -->
                            ${ui.renderSkeleton(3)}
                        </div>
                    </div>

                    <div class="glass-card insights-panel">
                        <div class="panel-header">
                            <h3>Financial Insights</h3>
                            <div class="stat-icon-wrapper primary"><i data-lucide="sparkles" class="streak-icon"></i></div>
                        </div>
                        <div class="insights-list" id="dash-insights-list">
                            <!-- Injected insights -->
                            <div class="skeleton" style="height:50px; border-radius:10px; margin-bottom:10px;"></div>
                            <div class="skeleton" style="height:50px; border-radius:10px; margin-bottom:10px;"></div>
                        </div>
                    </div>
                </div>
            `;
        },

        async init() {
            destroyActiveCharts();
            
            const curr = store.state.settings.currency;
            const symbol = currencySymbols[curr] || curr;
            
            try {
                // Fetch stats and charts concurrently
                const [dashData, chartData, insightsData, budgets] = await Promise.all([
                    api.analytics.getDashboardData(),
                    api.analytics.getChartData(),
                    api.analytics.getInsights(),
                    api.budgets.getCategoryBudgets()
                ]);
                
                // Set store properties
                store.setDashboardData(dashData);
                store.setChartData(chartData);
                store.setInsights(insightsData);
                store.setCategoryBudgets(budgets);
                
                // Update stats
                document.getElementById("dash-today-spent").textContent = `${symbol}${dashData.today_spent.toFixed(2)}`;
                document.getElementById("dash-month-spent").textContent = `${symbol}${dashData.month_spent.toFixed(2)}`;
                document.getElementById("dash-total-spent").textContent = `${symbol}${dashData.total_spent.toFixed(2)}`;
                document.getElementById("dash-highest-spent").textContent = `${symbol}${dashData.highest_expense.toFixed(2)}`;
                document.getElementById("dash-budget-info").textContent = `${symbol}${dashData.month_spent.toFixed(2)} of ${symbol}${dashData.monthly_budget.toFixed(2)} limit`;
                
                // Update budget ring
                const percent = Math.min(100, (dashData.month_spent / (dashData.monthly_budget || 1)) * 100);
                const ring = document.getElementById("budget-ring");
                if (ring) {
                    const circum = 2 * Math.PI * 70; // r=70
                    const offset = circum - (percent / 100) * circum;
                    ring.style.strokeDashoffset = offset;
                    document.getElementById("budget-percentage").textContent = `${percent.toFixed(0)}%`;
                }
                
                // Render Recent Transactions
                const recentList = document.getElementById("dash-recent-list");
                if (dashData.recent_transactions.length === 0) {
                    recentList.innerHTML = ui.renderEmptyState("No recent transactions.");
                } else {
                    recentList.innerHTML = dashData.recent_transactions
                        .map(e => ui.renderExpenseCard(e, symbol, false))
                        .join("");
                }
                
                // Render Insights
                const insightsList = document.getElementById("dash-insights-list");
                insightsList.innerHTML = insightsData.map(ins => `
                    <div class="insight-card ${ins.type}">
                        <i data-lucide="${ins.type === 'error' ? 'alert-octagon' : ins.type === 'warning' ? 'alert-triangle' : ins.type === 'success' ? 'check-circle' : 'info'}" class="insight-icon"></i>
                        <div class="insight-content">
                            <span class="insight-title">${ins.title}</span>
                            <span class="insight-message">${ins.message}</span>
                        </div>
                    </div>
                `).join("");
                
                // Render category budget status list (top 3 category progress bars)
                const budgetStatusList = document.getElementById("budget-status-summary");
                if (budgets.length === 0) {
                    budgetStatusList.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">No category budgets set. Click 'Adjust' to configure.</p>`;
                } else {
                    budgetStatusList.innerHTML = budgets.slice(0, 3).map(cb => {
                        const usagePct = Math.min(100, (cb.spent / (cb.budget_amount || 1)) * 100);
                        const progressClass = usagePct > 100 ? 'danger' : usagePct > 80 ? 'warning' : '';
                        return `
                            <div class="budget-status-item">
                                <div class="budget-status-info">
                                    <span>${cb.category}</span>
                                    <span>${symbol}${cb.spent.toFixed(0)} / ${symbol}${cb.budget_amount.toFixed(0)}</span>
                                </div>
                                <div class="progress-bar-container">
                                    <div class="progress-bar-fill ${progressClass}" style="width: ${usagePct}%"></div>
                                </div>
                            </div>
                        `;
                    }).join("");
                }
                
                // Initialize trend chart (Chart.js)
                const ctx = document.getElementById("trend-chart").getContext("2d");
                const trendLabels = chartData.spending_trend.map(t => t.date.substring(8));
                const trendValues = chartData.spending_trend.map(t => t.total);
                
                const isDark = store.state.settings.theme === "dark";
                
                activeCharts.trend = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: trendLabels.length ? trendLabels : ["01", "10", "20", "30"],
                        datasets: [{
                            label: 'Spending',
                            data: trendValues.length ? trendValues : [0, 0, 0, 0],
                            borderColor: '#0ea5e9',
                            backgroundColor: 'rgba(14, 165, 233, 0.05)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 3,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#8b5cf6'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                                ticks: { color: isDark ? '#9ca3af' : '#475569' }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: isDark ? '#9ca3af' : '#475569' }
                            }
                        }
                    }
                });

                // Attach adjust budget event
                document.getElementById("dash-set-budget-btn").addEventListener("click", () => {
                    const overlay = document.getElementById("modal-overlay");
                    const budgetModal = document.getElementById("budget-modal");
                    const input = document.getElementById("monthly-budget-input");
                    input.value = dashData.monthly_budget;
                    overlay.classList.remove("hidden");
                    budgetModal.classList.remove("hidden");
                });

                // Reinitialize lucide icons for elements injected
                if (window.lucide) window.lucide.createIcons();
                
            } catch (err) {
                console.error(err);
                ui.showToast(err.message, "error");
            }
        }
    },

    expenses: {
        async render(container) {
            container.innerHTML = `
                <div class="glass-card filter-card">
                    <div class="filters-grid">
                        <div class="form-group" style="margin:0;">
                            <label for="filter-q">Search</label>
                            <div class="input-wrapper">
                                <i data-lucide="search" class="input-icon"></i>
                                <input type="text" id="filter-q" placeholder="Search keywords...">
                            </div>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label for="filter-category">Category</label>
                            <select id="filter-category">
                                <option value="">All Categories</option>
                                <option value="Food">Food</option>
                                <option value="Transport">Transport</option>
                                <option value="Shopping">Shopping</option>
                                <option value="Entertainment">Entertainment</option>
                                <option value="Recharge">Recharge</option>
                                <option value="Medical">Medical</option>
                                <option value="Bills">Bills</option>
                                <option value="Education">Education</option>
                                <option value="Travel">Travel</option>
                                <option value="Fuel">Fuel</option>
                                <option value="Grocery">Grocery</option>
                                <option value="Investment">Investment</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label for="filter-payment-method">Payment Method</label>
                            <select id="filter-payment-method">
                                <option value="">All Methods</option>
                                <option value="Credit Card">Credit Card</option>
                                <option value="Debit Card">Debit Card</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI / Wallet">UPI / Wallet</option>
                                <option value="Net Banking">Net Banking</option>
                                <option value="Cryptocurrency">Cryptocurrency</option>
                            </select>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label for="filter-date-range">Date Range</label>
                            <select id="filter-date-range">
                                <option value="all">All Time</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="7days">Last 7 Days</option>
                                <option value="30days">Last 30 Days</option>
                                <option value="thismonth">This Month</option>
                                <option value="lastmonth">Last Month</option>
                            </select>
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label for="filter-sort">Sort By</label>
                            <select id="filter-sort">
                                <option value="date-desc">Newest First</option>
                                <option value="date-asc">Oldest First</option>
                                <option value="amount-desc">Highest Amount</option>
                                <option value="amount-asc">Lowest Amount</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="view-actions-header">
                    <h3 id="expenses-count-title">Loading Transactions...</h3>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <!-- Grid/List Switch -->
                        <div class="view-modes">
                            <button id="view-mode-list" class="btn-icon active" title="List View"><i data-lucide="list"></i></button>
                            <button id="view-mode-grid" class="btn-icon" title="Grid View"><i data-lucide="grid"></i></button>
                        </div>
                    </div>
                </div>

                <div id="expenses-display-container" class="transactions-list">
                    ${ui.renderSkeleton(5)}
                </div>

                <div class="pagination-container">
                    <button id="prev-page-btn" class="btn btn-secondary btn-compact"><i data-lucide="chevron-left"></i> Prev</button>
                    <span class="pagination-info" id="pagination-info-text">Page 1 of 1</span>
                    <button id="next-page-btn" class="btn btn-secondary btn-compact">Next <i data-lucide="chevron-right"></i></button>
                </div>
            `;
        },

        async init() {
            let activeMode = "list"; // list or grid
            const container = document.getElementById("expenses-display-container");
            const countTitle = document.getElementById("expenses-count-title");
            const pageInfo = document.getElementById("pagination-info-text");
            const prevBtn = document.getElementById("prev-page-btn");
            const nextBtn = document.getElementById("next-page-btn");

            // Setup filters from state
            const filters = store.state.filters;
            document.getElementById("filter-q").value = filters.q;
            document.getElementById("filter-category").value = filters.category;
            document.getElementById("filter-payment-method").value = filters.payment_method;
            document.getElementById("filter-sort").value = `${filters.sort_by}-${filters.sort_order}`;
            
            const loadExpensesList = async () => {
                container.innerHTML = ui.renderSkeleton(5);
                const curr = store.state.settings.currency;
                const symbol = currencySymbols[curr] || curr;
                
                try {
                    // Compute custom date filters based on dropdown selection
                    const rangeVal = document.getElementById("filter-date-range").value;
                    let start_date = "";
                    let end_date = "";
                    
                    const formatIso = d => d.toISOString().split('T')[0];
                    const today = new Date();
                    
                    if (rangeVal === "today") {
                        start_date = formatIso(today);
                        end_date = formatIso(today);
                    } else if (rangeVal === "yesterday") {
                        const yest = new Date(today);
                        yest.setDate(today.getDate() - 1);
                        start_date = formatIso(yest);
                        end_date = formatIso(yest);
                    } else if (rangeVal === "7days") {
                        const sevenDaysAgo = new Date(today);
                        sevenDaysAgo.setDate(today.getDate() - 7);
                        start_date = formatIso(sevenDaysAgo);
                    } else if (rangeVal === "30days") {
                        const thirtyDaysAgo = new Date(today);
                        thirtyDaysAgo.setDate(today.getDate() - 30);
                        start_date = formatIso(thirtyDaysAgo);
                    } else if (rangeVal === "thismonth") {
                        start_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
                    } else if (rangeVal === "lastmonth") {
                        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                        start_date = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
                        const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                        end_date = `${lastDayPrevMonth.getFullYear()}-${String(lastDayPrevMonth.getMonth() + 1).padStart(2, '0')}-${lastDayPrevMonth.getDate()}`;
                    }
                    
                    store.updateFilters({ start_date, end_date });
                    
                    const res = await api.expenses.getExpenses(store.state.filters);
                    store.setExpenses(res.expenses, res.total_count);
                    
                    countTitle.textContent = `${res.total_count} Transactions Logged`;
                    
                    if (res.expenses.length === 0) {
                        container.className = "transactions-list";
                        container.innerHTML = ui.renderEmptyState("No expenses match the filter criteria.");
                    } else {
                        if (activeMode === "list") {
                            container.className = "transactions-list";
                            container.innerHTML = res.expenses.map(e => ui.renderExpenseCard(e, symbol)).join("");
                        } else {
                            container.className = "expenses-grid-view";
                            container.innerHTML = res.expenses.map(e => ui.renderExpenseGridCard(e, symbol)).join("");
                        }
                    }
                    
                    // Render paginator info
                    const totalPages = Math.max(1, Math.ceil(res.total_count / store.state.filters.limit));
                    pageInfo.textContent = `Page ${store.state.filters.page} of ${totalPages}`;
                    
                    prevBtn.disabled = store.state.filters.page === 1;
                    nextBtn.disabled = store.state.filters.page === totalPages;
                    
                    if (window.lucide) window.lucide.createIcons();
                    attachCardActions();
                    
                } catch (err) {
                    ui.showToast(err.message, "error");
                }
            };
            
            const attachCardActions = () => {
                // Edit Trigger
                document.querySelectorAll(".edit-exp-btn").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const id = parseInt(btn.dataset.id);
                        const exp = store.state.expenses.find(x => x.id === id);
                        if (!exp) return;
                        
                        // Populate modal fields
                        document.getElementById("expense-id").value = exp.id;
                        document.getElementById("expense-amount").value = exp.amount;
                        document.getElementById("expense-category").value = exp.category;
                        document.getElementById("expense-description").value = exp.description;
                        document.getElementById("expense-date").value = exp.date;
                        document.getElementById("expense-time").value = exp.time;
                        document.getElementById("expense-payment-method").value = exp.payment_method;
                        document.getElementById("expense-location").value = exp.location || "";
                        document.getElementById("expense-notes").value = exp.notes || "";
                        
                        document.getElementById("expense-modal-title").textContent = "Modify Transaction";
                        
                        // Show modal
                        document.getElementById("modal-overlay").classList.remove("hidden");
                        document.getElementById("expense-modal").classList.remove("hidden");
                    });
                });
                
                // Delete Trigger
                document.querySelectorAll(".delete-exp-btn").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const id = parseInt(btn.dataset.id);
                        const exp = store.state.expenses.find(x => x.id === id);
                        
                        ui.showConfirmModal(`Remove transaction "${exp.description}" for $${exp.amount}?`, async () => {
                            try {
                                await api.expenses.deleteExpense(id);
                                ui.showToast("Expense removed", "success");
                                loadExpensesList();
                            } catch (err) {
                                ui.showToast(err.message, "error");
                            }
                        });
                    });
                });
            };
            
            // Set up search and filters triggers
            let searchTimeout;
            document.getElementById("filter-q").addEventListener("input", (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    store.updateFilters({ q: e.target.value, page: 1 });
                    loadExpensesList();
                }, 400);
            });
            
            document.getElementById("filter-category").addEventListener("change", (e) => {
                store.updateFilters({ category: e.target.value, page: 1 });
                loadExpensesList();
            });

            document.getElementById("filter-payment-method").addEventListener("change", (e) => {
                store.updateFilters({ payment_method: e.target.value, page: 1 });
                loadExpensesList();
            });

            document.getElementById("filter-date-range").addEventListener("change", () => {
                store.updateFilters({ page: 1 });
                loadExpensesList();
            });
            
            document.getElementById("filter-sort").addEventListener("change", (e) => {
                const [sort_by, sort_order] = e.target.value.split("-");
                store.updateFilters({ sort_by, sort_order, page: 1 });
                loadExpensesList();
            });
            
            // Layout View toggles
            const listBtn = document.getElementById("view-mode-list");
            const gridBtn = document.getElementById("view-mode-grid");
            
            listBtn.addEventListener("click", () => {
                activeMode = "list";
                listBtn.classList.add("active");
                gridBtn.classList.remove("active");
                loadExpensesList();
            });
            
            gridBtn.addEventListener("click", () => {
                activeMode = "grid";
                gridBtn.classList.add("active");
                listBtn.classList.remove("active");
                loadExpensesList();
            });
            
            // Pagination listeners
            prevBtn.addEventListener("click", () => {
                if (store.state.filters.page > 1) {
                    store.updateFilters({ page: store.state.filters.page - 1 });
                    loadExpensesList();
                }
            });
            
            nextBtn.addEventListener("click", () => {
                const totalPages = Math.ceil(store.state.totalCount / store.state.filters.limit);
                if (store.state.filters.page < totalPages) {
                    store.updateFilters({ page: store.state.filters.page + 1 });
                    loadExpensesList();
                }
            });
            
            // Initial call
            await loadExpensesList();
        }
    },

    analytics: {
        async render(container) {
            container.innerHTML = `
                <!-- Top Row Info Cards -->
                <div class="stats-grid">
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Average Daily Spending</span>
                            <div class="stat-icon-wrapper primary"><i data-lucide="trending-down"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="ana-avg-daily">...</div>
                            <div class="stat-footer">Current statement cycle</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Peak Category</span>
                            <div class="stat-icon-wrapper danger"><i data-lucide="shopping-bag"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="ana-top-cat">...</div>
                            <div class="stat-footer">Most expensive classification</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <span>Monthly Comparison</span>
                            <div class="stat-icon-wrapper success"><i data-lucide="shuffle"></i></div>
                        </div>
                        <div>
                            <div class="stat-value" id="ana-monthly-delta">...</div>
                            <div class="stat-footer">Versus previous cycle</div>
                        </div>
                    </div>
                </div>

                <!-- Charts Layout Grid -->
                <div class="analytics-grid">
                    <div class="glass-card chart-card">
                        <div class="chart-header">
                            <h3>Spending by Category</h3>
                        </div>
                        <div class="chart-canvas-container" style="height:300px; display:flex; justify-content:center;">
                            <canvas id="ana-pie-chart" style="max-width:300px;"></canvas>
                        </div>
                    </div>
                    
                    <div class="glass-card chart-card">
                        <div class="chart-header">
                            <h3>Payment Method Allocation</h3>
                        </div>
                        <div class="chart-canvas-container" style="height:300px; display:flex; justify-content:center;">
                            <canvas id="ana-payment-chart" style="max-width:300px;"></canvas>
                        </div>
                    </div>

                    <div class="glass-card chart-card analytics-full-width">
                        <div class="chart-header">
                            <h3>Monthly Total Trends (Past 6 Months)</h3>
                        </div>
                        <div class="chart-canvas-container">
                            <canvas id="ana-months-chart"></canvas>
                        </div>
                    </div>
                </div>
            `;
        },

        async init() {
            destroyActiveCharts();
            const curr = store.state.settings.currency;
            const symbol = currencySymbols[curr] || curr;
            const isDark = store.state.settings.theme === "dark";
            
            try {
                const [dashData, chartData] = await Promise.all([
                    api.analytics.getDashboardData(),
                    api.analytics.getChartData()
                ]);
                
                // Populating values
                document.getElementById("ana-avg-daily").textContent = `${symbol}${dashData.avg_daily.toFixed(2)}`;
                
                // Get top category
                const catDist = chartData.category_distribution;
                if (catDist.length) {
                    document.getElementById("ana-top-cat").textContent = catDist[0].category;
                } else {
                    document.getElementById("ana-top-cat").textContent = "N/A";
                }
                
                // Monthly comparison percentage delta
                const monthlyComp = chartData.monthly_comparison;
                const comparisonValEl = document.getElementById("ana-monthly-delta");
                if (monthlyComp.length >= 2) {
                    const currentMonthTotal = monthlyComp[monthlyComp.length - 1].total;
                    const prevMonthTotal = monthlyComp[monthlyComp.length - 2].total;
                    if (prevMonthTotal > 0) {
                        const delta = ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100;
                        const direction = delta > 0 ? '▲' : '▼';
                        comparisonValEl.innerHTML = `${direction} ${Math.abs(delta).toFixed(1)}%`;
                        comparisonValEl.style.color = delta > 0 ? 'var(--danger)' : 'var(--success)';
                    } else {
                        comparisonValEl.textContent = "100% (New)";
                    }
                } else {
                    comparisonValEl.textContent = "N/A";
                }
                
                // Render Pie Chart
                const pieCtx = document.getElementById("ana-pie-chart").getContext("2d");
                activeCharts.pie = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: catDist.map(c => c.category),
                        datasets: [{
                            data: catDist.map(c => c.total),
                            backgroundColor: [
                                '#0ea5e9', '#8b5cf6', '#ec4899', '#f43f5e', 
                                '#10b981', '#06b6d4', '#fbbf24', '#a855f7', '#6b7280'
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: { color: isDark ? '#9ca3af' : '#475569' }
                            }
                        }
                    }
                });
                
                // Render Payment Chart
                const payDist = chartData.payment_method_distribution;
                const payCtx = document.getElementById("ana-payment-chart").getContext("2d");
                activeCharts.payment = new Chart(payCtx, {
                    type: 'polarArea',
                    data: {
                        labels: payDist.map(p => p.payment_method),
                        datasets: [{
                            data: payDist.map(p => p.total),
                            backgroundColor: [
                                'rgba(14, 165, 233, 0.6)', 'rgba(139, 92, 246, 0.6)', 
                                'rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)', 
                                'rgba(6, 182, 212, 0.6)', 'rgba(239, 68, 68, 0.6)'
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: { color: isDark ? '#9ca3af' : '#475569' }
                            }
                        },
                        scales: {
                            r: {
                                grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                                ticks: { color: isDark ? '#9ca3af' : '#475569', backdropColor: 'transparent' }
                            }
                        }
                    }
                });
                
                // Render Bar Chart (Monthly totals)
                const barCtx = document.getElementById("ana-months-chart").getContext("2d");
                activeCharts.bar = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: monthlyComp.map(m => m.month),
                        datasets: [{
                            label: 'Monthly Spending',
                            data: monthlyComp.map(m => m.total),
                            backgroundColor: '#8b5cf6',
                            borderRadius: 6,
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                                ticks: { color: isDark ? '#9ca3af' : '#475569' }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: isDark ? '#9ca3af' : '#475569' }
                            }
                        }
                    }
                });
                
                if (window.lucide) window.lucide.createIcons();
                
            } catch (err) {
                ui.showToast(err.message, "error");
            }
        }
    },

    budget: {
        async render(container) {
            container.innerHTML = `
                <div class="budget-goals-section">
                    <div class="glass-card chart-card">
                        <h3>Configure Overall Budget</h3>
                        <p class="text-secondary" style="font-size:12px; margin-bottom: 20px;">Adjust your monthly overall threshold limit</p>
                        
                        <div class="budget-circle-container" style="margin-bottom: 20px;">
                            <svg class="budget-circle">
                                <circle class="budget-circle-bg" cx="80" cy="80" r="70"></circle>
                                <circle class="budget-circle-progress" id="budget-ring-planner" cx="80" cy="80" r="70" stroke-dasharray="440" stroke-dashoffset="440"></circle>
                            </svg>
                            <div class="budget-circle-text">
                                <span class="budget-circle-percent" id="budget-percent-planner">0%</span>
                                <span class="budget-circle-label">Spent</span>
                            </div>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <p style="font-size:13px; color:var(--text-secondary)">Total Monthly Budget</p>
                            <h2 id="planner-budget-amount" style="font-size:32px;">...</h2>
                            <p style="font-size:12px; color:var(--text-muted); margin-top:4px;" id="planner-remaining-amount">...</p>
                        </div>
                        
                        <button id="planner-edit-budget-btn" class="btn btn-primary btn-glow btn-full"><i data-lucide="edit"></i> Adjust Total Budget</button>
                    </div>

                    <div class="glass-card chart-card">
                        <div class="panel-header">
                            <div>
                                <h3>Category Budgets</h3>
                                <p class="text-secondary" style="font-size:12px;">Enforce limits on individual categories</p>
                            </div>
                            <button id="planner-add-cat-btn" class="btn btn-primary btn-glow btn-compact"><i data-lucide="plus"></i> Add Limit</button>
                        </div>

                        <div class="budget-limits-list" id="planner-cat-list">
                            <!-- Category Budgets Injected Here -->
                            <div class="skeleton" style="height:40px; border-radius:10px;"></div>
                            <div class="skeleton" style="height:40px; border-radius:10px;"></div>
                        </div>
                    </div>
                </div>
            `;
        },

        async init() {
            const curr = store.state.settings.currency;
            const symbol = currencySymbols[curr] || curr;
            
            const loadPlannerData = async () => {
                try {
                    const dashData = await api.analytics.getDashboardData();
                    const budgets = await api.budgets.getCategoryBudgets();
                    
                    document.getElementById("planner-budget-amount").textContent = `${symbol}${dashData.monthly_budget.toFixed(2)}`;
                    const remaining = dashData.monthly_budget - dashData.month_spent;
                    const rText = remaining >= 0 ? `Remaining: ${symbol}${remaining.toFixed(2)}` : `Over Budget: -${symbol}${Math.abs(remaining).toFixed(2)}`;
                    document.getElementById("planner-remaining-amount").textContent = rText;
                    
                    const percent = Math.min(100, (dashData.month_spent / (dashData.monthly_budget || 1)) * 100);
                    const ring = document.getElementById("budget-ring-planner");
                    if (ring) {
                        const circum = 2 * Math.PI * 70;
                        const offset = circum - (percent / 100) * circum;
                        ring.style.strokeDashoffset = offset;
                        document.getElementById("budget-percent-planner").textContent = `${percent.toFixed(0)}%`;
                    }
                    
                    // Render Category Limits
                    const catList = document.getElementById("planner-cat-list");
                    if (budgets.length === 0) {
                        catList.innerHTML = ui.renderEmptyState("No category budget limits configured yet.");
                    } else {
                        catList.innerHTML = budgets.map(cb => {
                            const usagePct = Math.min(100, (cb.spent / (cb.budget_amount || 1)) * 100);
                            const usageColor = usagePct > 100 ? 'var(--danger)' : usagePct > 80 ? 'var(--warning)' : 'var(--success)';
                            return `
                                <div class="limit-item">
                                    <div style="flex:1;">
                                        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-weight:600; font-size:14px;">
                                            <span>${cb.category}</span>
                                            <span style="color: ${usageColor}">${symbol}${cb.spent.toFixed(2)} / ${symbol}${cb.budget_amount.toFixed(2)}</span>
                                        </div>
                                        <div class="progress-bar-container">
                                            <div class="progress-bar-fill ${usagePct > 100 ? 'danger' : usagePct > 80 ? 'warning' : ''}" style="width: ${usagePct}%"></div>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:6px; margin-left:20px;">
                                        <button class="btn-icon btn-compact edit-cat-limit-btn" data-category="${cb.category}" data-amount="${cb.budget_amount}" title="Edit"><i data-lucide="edit-3"></i></button>
                                        <button class="btn-icon btn-danger btn-compact delete-cat-limit-btn" data-category="${cb.category}" title="Delete"><i data-lucide="trash-2"></i></button>
                                    </div>
                                </div>
                            `;
                        }).join("");
                    }
                    
                    if (window.lucide) window.lucide.createIcons();
                    attachActions();
                    
                } catch (err) {
                    ui.showToast(err.message, "error");
                }
            };
            
            const attachActions = () => {
                // Edit category limit
                document.querySelectorAll(".edit-cat-limit-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const cat = btn.dataset.category;
                        const amt = btn.dataset.amount;
                        
                        document.getElementById("cat-budget-select").value = cat;
                        document.getElementById("cat-budget-amount").value = amt;
                        
                        document.getElementById("modal-overlay").classList.remove("hidden");
                        document.getElementById("cat-budget-modal").classList.remove("hidden");
                    });
                });
                
                // Delete category limit
                document.querySelectorAll(".delete-cat-limit-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const cat = btn.dataset.category;
                        ui.showConfirmModal(`Remove budget limit for category "${cat}"?`, async () => {
                            try {
                                await api.budgets.deleteCategoryBudget(cat);
                                ui.showToast(`Removed limit for ${cat}`, "success");
                                loadPlannerData();
                            } catch (err) {
                                ui.showToast(err.message, "error");
                            }
                        });
                    });
                });
            };
            
            // Adjust budget
            document.getElementById("planner-edit-budget-btn").addEventListener("click", () => {
                const amt = parseFloat(document.getElementById("planner-budget-amount").textContent.replace(symbol, '')) || 0;
                document.getElementById("monthly-budget-input").value = amt;
                document.getElementById("modal-overlay").classList.remove("hidden");
                document.getElementById("budget-modal").classList.remove("hidden");
            });
            
            // Add category limit
            document.getElementById("planner-add-cat-btn").addEventListener("click", () => {
                document.getElementById("cat-budget-select").value = "Food";
                document.getElementById("cat-budget-amount").value = "";
                document.getElementById("modal-overlay").classList.remove("hidden");
                document.getElementById("cat-budget-modal").classList.remove("hidden");
            });
            
            // Budget forms are handled globally by app.js
            
            await loadPlannerData();
        }
    },

    profile: {
        async render(container) {
            container.innerHTML = `
                <div class="profile-grid">
                    <div class="glass-card profile-card-left">
                        <div class="avatar-wrapper">
                            <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Aether" id="profile-avatar-img" class="avatar-img" alt="Avatar">
                        </div>
                        <div>
                            <h3 id="profile-username" style="font-size:20px; margin-bottom:4px;">...</h3>
                            <span class="text-secondary" style="font-size:12px;">Active Wealth Surveyor</span>
                        </div>
                        
                        <div style="border-top:1px solid var(--border-color); width:100%; padding-top:20px; display:flex; justify-content:space-around;">
                            <div>
                                <h4 id="profile-streak" style="font-size:24px; color:var(--warning)">0</h4>
                                <span class="text-muted" style="font-size:11px;">Day Streak</span>
                            </div>
                            <div>
                                <h4 id="profile-score" style="font-size:24px; color:var(--primary)">0</h4>
                                <span class="text-muted" style="font-size:11px;">Finance Score</span>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card chart-card">
                        <h3>Achievements & Goal Setting</h3>
                        
                        <div class="form-group" style="margin-top:20px;">
                            <label for="profile-goal-input">Monthly Saving Ambition Goal</label>
                            <div style="display:flex; gap:12px;">
                                <input type="text" id="profile-goal-input" placeholder="e.g. Save 20% of my total earnings">
                                <button id="profile-goal-save-btn" class="btn btn-primary btn-glow">Update Goal</button>
                            </div>
                        </div>

                        <h4 style="margin-top:30px;">Earned Status Medals</h4>
                        <div class="badges-grid" id="profile-badges-container">
                            <!-- Badges dynamic load -->
                            <div class="badge-item"><div class="skeleton" style="width:24px;height:24px;"></div></div>
                            <div class="badge-item"><div class="skeleton" style="width:24px;height:24px;"></div></div>
                        </div>
                    </div>
                </div>
            `;
        },

        async init() {
            try {
                const profile = await api.user.getProfile();
                store.setUser(profile);
                
                document.getElementById("profile-username").textContent = `@${profile.username}`;
                document.getElementById("profile-streak").textContent = profile.streak;
                document.getElementById("profile-score").textContent = profile.financial_score;
                document.getElementById("profile-goal-input").value = profile.financial_goal || "";
                
                // Update avatar using dicebear seed
                document.getElementById("profile-avatar-img").src = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${profile.avatar || profile.username}`;
                
                // Load badges
                const badgesCont = document.getElementById("profile-badges-container");
                const earnedBadgeIds = profile.badges.map(b => b.id);
                
                const allBadges = [
                    { id: "first", title: "Saver Kickstart", desc: "First logged expense", icon: "rocket" },
                    { id: "consistent", title: "Disciplined", desc: "Logged 10+ expenses", icon: "award" },
                    { id: "streak", title: "Habitual", desc: "5-day logging streak", icon: "flame" },
                    { id: "heavy", title: "Heavy Roller", desc: "Spent over $5,000", icon: "crown" }
                ];
                
                badgesCont.innerHTML = allBadges.map(b => {
                    const earned = earnedBadgeIds.includes(b.id);
                    return `
                        <div class="badge-item ${earned ? 'earned' : ''}" title="${b.desc}">
                            <i data-lucide="${b.icon}"></i>
                            <span class="badge-title">${b.title}</span>
                            <span style="font-size:9px; color:var(--text-muted);">${earned ? 'Unlocked' : 'Locked'}</span>
                        </div>
                    `;
                }).join("");
                
                if (window.lucide) window.lucide.createIcons();
                
                // Save goal
                document.getElementById("profile-goal-save-btn").onclick = async () => {
                    const goalVal = document.getElementById("profile-goal-input").value;
                    try {
                        await api.user.updateProfile({ financial_goal: goalVal });
                        ui.showToast("Wealth ambition goal saved", "success");
                    } catch (err) {
                        ui.showToast(err.message, "error");
                    }
                };
                
            } catch (err) {
                ui.showToast(err.message, "error");
            }
        }
    },

    settings: {
        async render(container) {
            container.innerHTML = `
                <div class="profile-grid">
                    <!-- Preferences Form -->
                    <div class="glass-card chart-card">
                        <h3>System Preferences</h3>
                        <form id="settings-form" style="margin-top:20px;">
                            <div class="form-group">
                                <label for="settings-currency">Base Currency</label>
                                <select id="settings-currency">
                                    <option value="USD">USD ($)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="GBP">GBP (£)</option>
                                    <option value="INR">INR (₹)</option>
                                    <option value="JPY">JPY (¥)</option>
                                    <option value="CAD">CAD (C$)</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="settings-theme">Visual Theme Mode</label>
                                <select id="settings-theme">
                                    <option value="dark">Dark Space Mode</option>
                                    <option value="light">Bright Photon Mode</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="settings-font-size">Text Font Size</label>
                                <select id="settings-font-size">
                                    <option value="small">Small (Compressed)</option>
                                    <option value="medium">Medium (Standard)</option>
                                    <option value="large">Large (Magnified)</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="settings-notifications">System Notifications</label>
                                <select id="settings-notifications">
                                    <option value="enabled">Enabled (Radar Alert)</option>
                                    <option value="disabled">Disabled (Silent Mode)</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="settings-language">Core Language</label>
                                <select id="settings-language">
                                    <option value="en">English (Universal)</option>
                                    <option value="es">Español</option>
                                    <option value="fr">Français</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Accent Neon Glow</label>
                                <div class="color-picker" id="accent-picker">
                                    <div class="color-dot active" style="background:#0ea5e9;" data-color="cyan"></div>
                                    <div class="color-dot" style="background:#a855f7;" data-color="purple"></div>
                                    <div class="color-dot" style="background:#10b981;" data-color="green"></div>
                                    <div class="color-dot" style="background:#ec4899;" data-color="pink"></div>
                                </div>
                            </div>
                            
                            <button type="submit" class="btn btn-primary btn-glow btn-full" style="margin-top:10px;">Commit System Upgrades</button>
                        </form>

                        <!-- PIN Update Form -->
                        <div style="margin-top: 30px; padding-top:20px; border-top:1px solid var(--border-color)">
                            <h3>PIN Lock Security</h3>
                            <div class="form-group" style="margin-top:15px;">
                                <label for="settings-pin-input">Update Secure PIN (4-Digits)</label>
                                <div style="display:flex; gap:12px;">
                                    <input type="password" id="settings-pin-input" maxlength="4" placeholder="••••" pattern="[0-9]*" inputmode="numeric">
                                    <button id="settings-save-pin-btn" class="btn btn-secondary">Lock Vault</button>
                                    <button id="settings-remove-pin-btn" class="btn btn-danger btn-compact">Remove PIN</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Data management panel -->
                    <div class="glass-card chart-card">
                        <h3>Data Integration & Exports</h3>
                        <p class="text-secondary" style="font-size:12px; margin-bottom:20px;">Download archives or ingest files into the database</p>
                        
                        <div style="display:flex; flex-direction:column; gap:16px;">
                            <!-- Exporters -->
                            <div class="limit-item">
                                <div>
                                    <h4 style="font-size:14px;">CSV Spreadsheet Export</h4>
                                    <p style="font-size:11px; color:var(--text-secondary)">Standard comma-separated transaction records</p>
                                </div>
                                <button id="btn-export-csv" class="btn btn-secondary btn-compact"><i data-lucide="download"></i> Download CSV</button>
                            </div>
                            
                            <div class="limit-item">
                                <div>
                                    <h4 style="font-size:14px;">Stellar PDF Statement</h4>
                                    <p style="font-size:11px; color:var(--text-secondary)">Print-optimized financial monthly overview</p>
                                </div>
                                <button id="btn-export-pdf" class="btn btn-secondary btn-compact"><i data-lucide="file-text"></i> Export PDF</button>
                            </div>

                            <div class="limit-item">
                                <div>
                                    <h4 style="font-size:14px;">JSON Ledger Database Backup</h4>
                                    <p style="font-size:11px; color:var(--text-secondary)">Comprehensive profile & transactions copy</p>
                                </div>
                                <button id="btn-export-backup" class="btn btn-secondary btn-compact"><i data-lucide="shield-alert"></i> Back Up JSON</button>
                            </div>
                            
                            <!-- Importers -->
                            <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:20px;">
                                <h4>Restore or Import File</h4>
                                <p style="font-size:11px; color:var(--text-secondary); margin-bottom:15px;">Ingest CSV expenses or upload a backup JSON ledger file</p>
                                
                                <div style="display:flex; gap:16px; align-items:center;">
                                    <select id="import-type-select" style="width:auto; padding:8px 12px; font-size:13px; height:38px;">
                                        <option value="csv">Import CSV</option>
                                        <option value="json">Restore JSON Backup</option>
                                    </select>
                                    <input type="file" id="import-file-input" style="display:none;" accept=".csv,.json">
                                    <button id="btn-trigger-import" class="btn btn-primary btn-glow btn-compact"><i data-lucide="upload"></i> Select File</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        async init() {
            const currentSettings = store.state.settings;
            document.getElementById("settings-currency").value = currentSettings.currency;
            document.getElementById("settings-theme").value = currentSettings.theme;
            document.getElementById("settings-font-size").value = currentSettings.font_size || "medium";
            document.getElementById("settings-notifications").value = currentSettings.notifications || "enabled";
            document.getElementById("settings-language").value = currentSettings.language || "en";
            
            // Set active color pick dot
            const dots = document.querySelectorAll("#accent-picker .color-dot");
            dots.forEach(dot => {
                if (dot.dataset.color === currentSettings.accent_color) {
                    dots.forEach(d => d.classList.remove("active"));
                    dot.classList.add("active");
                }
                
                dot.addEventListener("click", () => {
                    dots.forEach(d => d.classList.remove("active"));
                    dot.classList.add("active");
                });
            });
            
            // Save preferences
            document.getElementById("settings-form").onsubmit = async (e) => {
                e.preventDefault();
                const currency = document.getElementById("settings-currency").value;
                const theme = document.getElementById("settings-theme").value;
                const font_size = document.getElementById("settings-font-size").value;
                const notifications = document.getElementById("settings-notifications").value;
                const language = document.getElementById("settings-language").value;
                const activeColorDot = document.querySelector("#accent-picker .color-dot.active");
                const accent_color = activeColorDot ? activeColorDot.dataset.color : "cyan";
                
                try {
                    await api.user.updateProfile({ currency, theme, accent_color, font_size, notifications, language });
                    store.updateSettings({ currency, theme, accent_color, font_size, notifications, language });
                    
                    // Trigger visual application theme update
                    document.body.className = `${theme === "light" ? "light-theme" : "dark-theme"} accent-${accent_color} font-${font_size}`;
                    
                    // Redraw symbol prefixes
                    const prefix = currencySymbols[currency] || currency;
                    document.querySelectorAll(".currency-prefix").forEach(p => p.textContent = prefix);
                    
                    ui.showToast("System configurations committed successfully", "success");
                    
                } catch (err) {
                    ui.showToast(err.message, "error");
                }
            };
            
            // PIN management
            document.getElementById("settings-save-pin-btn").onclick = async () => {
                const pin = document.getElementById("settings-pin-input").value;
                if (!pin || pin.length < 4) {
                    ui.showToast("PIN must be 4 digits", "warning");
                    return;
                }
                try {
                    await api.auth.updatePin(pin);
                    store.setPinRequirements(true, true);
                    document.getElementById("settings-pin-input").value = "";
                    ui.showToast("Vault security lock PIN updated", "success");
                } catch (err) {
                    ui.showToast(err.message, "error");
                }
            };
            
            document.getElementById("settings-remove-pin-btn").onclick = async () => {
                try {
                    await api.auth.updatePin("");
                    store.setPinRequirements(false, false);
                    ui.showToast("PIN lock removed, secure vault disabled", "info");
                } catch (err) {
                    ui.showToast(err.message, "error");
                }
            };

            // File Downloads
            document.getElementById("btn-export-csv").addEventListener("click", () => api.reports.downloadCSV());
            document.getElementById("btn-export-backup").addEventListener("click", () => api.reports.downloadBackup());
            
            document.getElementById("btn-export-pdf").addEventListener("click", () => {
                const now = new Date();
                const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const url = api.reports.getPDFReportURL(monthStr);
                // Open HTML print statement in a new window/tab
                window.open(url, "_blank");
            });
            
            // File Ingest imports
            const fileInput = document.getElementById("import-file-input");
            const selectBtn = document.getElementById("btn-trigger-import");
            const typeSelect = document.getElementById("import-type-select");
            
            typeSelect.addEventListener("change", (e) => {
                if (e.target.value === "csv") {
                    fileInput.accept = ".csv";
                } else {
                    fileInput.accept = ".json";
                }
            });
            
            selectBtn.addEventListener("click", () => {
                fileInput.click();
            });
            
            fileInput.addEventListener("change", async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const type = typeSelect.value;
                document.getElementById("global-loader").classList.remove("hidden");
                
                try {
                    if (type === "csv") {
                        await api.reports.uploadCSV(file);
                        ui.showToast("Expenses spreadsheet CSV successfully imported", "success");
                    } else {
                        await api.reports.uploadBackup(file);
                        ui.showToast("JSON ledger database restore completed", "success");
                        // Rerender layout settings
                        const profile = await api.user.getProfile();
                        store.setUser(profile);
                        document.body.className = `${profile.theme === "light" ? "light-theme" : "dark-theme"} accent-${profile.accent_color || 'cyan'} font-${profile.font_size || 'medium'}`;
                    }
                } catch (err) {
                    ui.showToast(err.message, "error");
                } finally {
                    document.getElementById("global-loader").classList.add("hidden");
                    fileInput.value = ""; // clear file
                }
            });

            if (window.lucide) window.lucide.createIcons();
        }
    }
};
