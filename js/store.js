class Store {
    constructor() {
        const cachedSettings = JSON.parse(localStorage.getItem("aether_settings")) || {
            currency: "USD",
            theme: "dark",
            accent_color: "cyan",
            font_size: "medium",
            notifications: "enabled",
            language: "en"
        };

        this.state = {
            token: localStorage.getItem("aether_token") || null,
            user: null,
            requiresPin: localStorage.getItem("aether_requires_pin") === "true",
            pinVerified: false,
            
            expenses: [],
            totalCount: 0,
            
            categoryBudgets: [],
            
            dashboardData: null,
            chartData: null,
            insights: [],
            
            filters: {
                q: "",
                category: "",
                payment_method: "",
                start_date: "",
                end_date: "",
                sort_by: "date",
                sort_order: "desc",
                limit: 10,
                page: 1
            },
            
            settings: cachedSettings
        };
        
        this.listeners = [];
    }

    // Pub-Sub system for state changes
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    emitChange() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // Setters & Actions
    setToken(token) {
        this.state.token = token;
        if (token) {
            localStorage.setItem("aether_token", token);
        } else {
            localStorage.removeItem("aether_token");
            localStorage.removeItem("aether_requires_pin");
            localStorage.removeItem("aether_settings");
            this.state.pinVerified = false;
            this.state.requiresPin = false;
        }
        this.emitChange();
    }

    setUser(user) {
        this.state.user = user;
        if (user) {
            this.state.settings = {
                currency: user.currency || "USD",
                theme: user.theme || "dark",
                accent_color: user.accent_color || "cyan",
                font_size: user.font_size || "medium",
                notifications: user.notifications || "enabled",
                language: user.language || "en"
            };
            localStorage.setItem("aether_settings", JSON.stringify(this.state.settings));
        }
        this.emitChange();
    }

    setPinRequirements(requiresPin, verified = false) {
        this.state.requiresPin = requiresPin;
        this.state.pinVerified = verified;
        localStorage.setItem("aether_requires_pin", requiresPin ? "true" : "false");
        this.emitChange();
    }

    setExpenses(expenses, totalCount) {
        this.state.expenses = expenses;
        this.state.totalCount = totalCount;
        this.emitChange();
    }

    updateFilters(newFilters) {
        this.state.filters = { ...this.state.filters, ...newFilters };
        this.emitChange();
    }

    resetFilters() {
        this.state.filters = {
            q: "",
            category: "",
            payment_method: "",
            start_date: "",
            end_date: "",
            sort_by: "date",
            sort_order: "desc",
            limit: 10,
            page: 1
        };
        this.emitChange();
    }

    setDashboardData(data) {
        this.state.dashboardData = data;
        this.emitChange();
    }

    setChartData(data) {
        this.state.chartData = data;
        this.emitChange();
    }

    setCategoryBudgets(budgets) {
        this.state.categoryBudgets = budgets;
        this.emitChange();
    }

    setInsights(insights) {
        this.state.insights = insights;
        this.emitChange();
    }

    updateSettings(newSettings) {
        this.state.settings = { ...this.state.settings, ...newSettings };
        localStorage.setItem("aether_settings", JSON.stringify(this.state.settings));
        this.emitChange();
    }

    get isAuthenticated() {
        return !!this.state.token && (!this.state.requiresPin || this.state.pinVerified);
    }
}

export const store = new Store();
