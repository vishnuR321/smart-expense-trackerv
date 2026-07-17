import { store } from "./store.js";
import { api } from "./api.js";
import { ui } from "./components.js";
import { views } from "./views.js";

let currentActiveView = "dashboard";

// --- APPLICATION INITIALIZER ---
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Immediately apply cached visual settings to prevent flashing
    const initSet = store.state.settings;
    document.body.className = `${initSet.theme === "light" ? "light-theme" : "dark-theme"} accent-${initSet.accent_color || 'cyan'} font-${initSet.font_size || 'medium'}`;

    // 2. Prefill username if remembered
    const savedUser = localStorage.getItem("aether_saved_username");
    if (savedUser) {
        document.getElementById("auth-username").value = savedUser;
        document.getElementById("auth-remember").checked = true;
    }

    // 3. Start Inactivity Monitor (Auto-lock if idle for 5 mins)
    startInactivityMonitor();

    // 4. Bind Cloud Sync Click
    bindCloudSync();

    // Check initial state
    evaluateAuthState();

    // Start running clock
    startClock();

    // Bind auth forms
    bindAuthEvents();

    // Bind navigation buttons
    bindNavEvents();

    // Bind modals
    bindModalEvents();

    // Bind expense form submit
    bindExpenseFormEvents();

    // Bind budget forms submit
    bindBudgetFormEvents();
});

// Watch for unauthorized events
window.addEventListener("unauthorized", () => {
    evaluateAuthState();
    ui.showToast("Your session has expired. Please log in again.", "warning");
});

// --- CLOCK CONTROLLER ---
function startClock() {
    const clockEl = document.getElementById("current-date-time");
    const update = () => {
        if (!clockEl) return;
        const now = new Date();
        const dateOpt = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString(undefined, dateOpt);
        const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        clockEl.textContent = `${dateStr} — ${timeStr} GMT`;
    };
    update();
    setInterval(update, 1000);
}

// --- AUTHENTICATION STATE EVALUATOR ---
async function evaluateAuthState() {
    const authOverlay = document.getElementById("auth-overlay");
    const appLayout = document.getElementById("app-layout");
    const pinForm = document.getElementById("pin-form");
    const credForm = document.getElementById("credentials-form");
    const authTitle = document.getElementById("auth-title");
    const authSub = document.getElementById("auth-subtitle");

    if (!store.state.token) {
        // Not logged in -> Show Username/Password
        authOverlay.classList.remove("hidden");
        appLayout.classList.add("hidden");
        credForm.classList.remove("hidden");
        pinForm.classList.add("hidden");
        authTitle.textContent = "Welcome to Aether";
        authSub.textContent = "Futuristic wealth tracking & smart analytics";
        return;
    }

    if (store.state.requiresPin && !store.state.pinVerified) {
        // Logged in but needs PIN -> Show PIN entry screen
        authOverlay.classList.remove("hidden");
        appLayout.classList.add("hidden");
        credForm.classList.add("hidden");
        pinForm.classList.remove("hidden");
        authTitle.textContent = "Vault Security Lock";
        authSub.textContent = "Enter your secure PIN to access data";
        document.getElementById("pin-input").focus();
        return;
    }

    // Fully authenticated -> Load profile & enter app
    document.getElementById("global-loader").classList.remove("hidden");
    try {
        const profile = await api.user.getProfile();
        store.setUser(profile);
        
        // Apply user preference theme
        document.body.className = `${profile.theme === "light" ? "light-theme" : "dark-theme"} accent-${profile.accent_color || 'cyan'} font-${profile.font_size || 'medium'}`;
        
        // Update user greeting in header
        document.getElementById("welcome-message").textContent = `Welcome, @${profile.username}`;
        document.getElementById("streak-count").textContent = profile.streak;
        
        // Hide overlay, reveal dashboard
        authOverlay.classList.add("hidden");
        appLayout.classList.remove("hidden");
        
        // Load initial view
        await navigateToView(currentActiveView);
        
    } catch (err) {
        // If profile fetch fails, token is likely bad
        store.setToken(null);
        evaluateAuthState();
    } finally {
        document.getElementById("global-loader").classList.add("hidden");
    }
}

// --- VIEW NAVIGATION ROUTER ---
async function navigateToView(viewName) {
    if (!views[viewName]) return;
    
    currentActiveView = viewName;
    const viewContainer = document.getElementById("view-container");
    
    // Set active styles for both sidebar and mobile bottom navigation items
    document.querySelectorAll(".nav-item").forEach(btn => {
        if (btn.dataset.view === viewName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    document.getElementById("global-loader").classList.remove("hidden");
    try {
        await views[viewName].render(viewContainer);
        await views[viewName].init();
    } catch (err) {
        ui.showToast(err.message, "error");
    } finally {
        document.getElementById("global-loader").classList.add("hidden");
    }
}

// --- REGISTER & LOGIN FORM HANDLERS ---
function bindAuthEvents() {
    const credForm = document.getElementById("credentials-form");
    const pinForm = document.getElementById("pin-form");
    const switchBtn = document.getElementById("auth-switch-btn");
    const switchText = document.getElementById("auth-switch-text");
    const submitBtn = document.getElementById("auth-submit-btn");
    
    let mode = "login"; // login or register
    
    switchBtn.addEventListener("click", () => {
        if (mode === "login") {
            mode = "register";
            submitBtn.textContent = "Create New Account";
            switchText.textContent = "Already registered?";
            switchBtn.textContent = "Sign In Instead";
        } else {
            mode = "login";
            submitBtn.textContent = "Enter Ecosystem";
            switchText.textContent = "New to the future?";
            switchBtn.textContent = "Create Account";
        }
    });

    credForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("auth-username").value;
        const password = document.getElementById("auth-password").value;
        
        document.getElementById("global-loader").classList.remove("hidden");
        try {
            if (mode === "register") {
                await api.auth.register(username, password);
                ui.showToast("Registration completed! Logging you in...", "success");
            }
            
            const res = await api.auth.login(username, password);
            
            // Handle Remember Username
            const remember = document.getElementById("auth-remember").checked;
            if (remember) {
                localStorage.setItem("aether_saved_username", username);
            } else {
                localStorage.removeItem("aether_saved_username");
            }

            store.setPinRequirements(res.requires_pin, false);
            store.setToken(res.access_token);
            
            // Clear inputs
            credForm.reset();
            evaluateAuthState();
            
        } catch (err) {
            ui.showToast(err.message, "error");
        } finally {
            document.getElementById("global-loader").classList.add("hidden");
        }
    });

    // PIN lock submission
    const pinDots = document.querySelectorAll(".pin-dots .dot");
    const pinInput = document.getElementById("pin-input");

    pinInput.addEventListener("input", (e) => {
        const val = e.target.value;
        pinDots.forEach((dot, idx) => {
            if (idx < val.length) {
                dot.classList.add("filled");
            } else {
                dot.classList.remove("filled");
            }
        });
    });

    pinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pinVal = pinInput.value;
        
        document.getElementById("global-loader").classList.remove("hidden");
        try {
            await api.auth.verifyPin(pinVal);
            store.setPinRequirements(store.state.requiresPin, true);
            
            pinInput.value = "";
            pinDots.forEach(dot => dot.classList.remove("filled"));
            evaluateAuthState();
            
        } catch (err) {
            ui.showToast("Verification failed: Invalid PIN", "error");
            pinInput.value = "";
            pinDots.forEach(dot => dot.classList.remove("filled"));
            pinInput.focus();
        } finally {
            document.getElementById("global-loader").classList.add("hidden");
        }
    });
}

// --- CORE NAVIGATION EVENTS ---
function bindNavEvents() {
    // Navigation items click (handles both sidebar and mobile bottom nav)
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetView = btn.dataset.view;
            navigateToView(targetView);
        });
    });

    // Handle clicks for dynamically rendered nav-buttons
    document.addEventListener("click", (e) => {
        const targetBtn = e.target.closest(".nav-btn");
        if (targetBtn) {
            const targetView = targetBtn.dataset.targetView;
            navigateToView(targetView);
        }
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", () => {
        store.setToken(null);
        evaluateAuthState();
        ui.showToast("Secured connection terminated", "info");
    });
}

// --- MODALS TOGGLERS ---
function bindModalEvents() {
    const overlay = document.getElementById("modal-overlay");
    const modals = document.querySelectorAll(".modal-card");
    
    // Close modal triggers
    document.querySelectorAll(".close-modal-btn, #confirm-cancel-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            overlay.classList.add("hidden");
            modals.forEach(m => m.classList.add("hidden"));
        });
    });

    // Close on overlay backdrop click
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            overlay.classList.add("hidden");
            modals.forEach(m => m.classList.add("hidden"));
        }
    });

    // Floating add transaction
    const expForm = document.getElementById("expense-form");
    document.getElementById("quick-add-btn").addEventListener("click", () => {
        expForm.reset();
        document.getElementById("expense-id").value = "";
        
        // Default current date and time
        const now = new Date();
        document.getElementById("expense-date").value = now.toISOString().split('T')[0];
        document.getElementById("expense-time").value = now.toTimeString().substring(0, 5);
        document.getElementById("expense-modal-title").textContent = "Log Transaction";
        
        // Show modal
        overlay.classList.remove("hidden");
        document.getElementById("expense-modal").classList.remove("hidden");
    });

    // Suggestion chips listeners
    document.querySelectorAll(".suggestions-chips .chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.getElementById("expense-amount").value = chip.dataset.amount;
            document.getElementById("expense-category").value = chip.dataset.category;
            document.getElementById("expense-description").value = chip.dataset.desc;
        });
    });
}

// --- SUBMIT TRANSACTION FORM HANDLERS ---
function bindExpenseFormEvents() {
    const expForm = document.getElementById("expense-form");
    const overlay = document.getElementById("modal-overlay");
    const modal = document.getElementById("expense-modal");
    
    expForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const id = document.getElementById("expense-id").value;
        const amount = parseFloat(document.getElementById("expense-amount").value);
        const category = document.getElementById("expense-category").value;
        const description = document.getElementById("expense-description").value;
        const date = document.getElementById("expense-date").value;
        const time = document.getElementById("expense-time").value;
        const payment_method = document.getElementById("expense-payment-method").value;
        const location = document.getElementById("expense-location").value || null;
        const notes = document.getElementById("expense-notes").value || null;
        
        const payload = {
            amount, category, description, date, time, payment_method, location, notes
        };
        
        document.getElementById("global-loader").classList.remove("hidden");
        
        try {
            if (id) {
                // Update
                await api.expenses.updateExpense(id, payload);
                ui.showToast("Transaction modified successfully", "success");
            } else {
                // Create
                const res = await api.expenses.createExpense(payload);
                
                // Show budget alerts if generated by backend
                if (res.category_warning) {
                    ui.showToast(res.category_warning, "warning");
                } else {
                    ui.showToast("Transaction committed to ledger", "success");
                }
            }
            
            // Close modal
            overlay.classList.add("hidden");
            modal.classList.add("hidden");
            expForm.reset();
            
            // Reload current active view to show changes
            await navigateToView(currentActiveView);
            
        } catch (err) {
            ui.showToast(err.message, "error");
        } finally {
            document.getElementById("global-loader").classList.add("hidden");
        }
    });
}

// --- MOCK CLOUD SYNC CONTROLLER ---
function bindCloudSync() {
    const syncBadge = document.getElementById("cloud-sync-badge");
    const syncIcon = document.getElementById("cloud-sync-icon");
    const syncText = document.getElementById("cloud-sync-text");
    
    if (!syncBadge) return;
    
    syncBadge.addEventListener("click", () => {
        if (syncText.textContent === "Syncing...") return;
        
        // Spin the icon
        syncIcon.style.animation = "spin 1s linear infinite";
        syncText.textContent = "Syncing...";
        syncBadge.style.color = "var(--warning)";
        syncBadge.style.borderColor = "rgba(245,158,11,0.2)";
        syncBadge.style.background = "rgba(245,158,11,0.1)";
        
        setTimeout(() => {
            syncIcon.style.animation = "";
            syncText.textContent = "Cloud Sync: Online";
            syncBadge.style.color = "var(--success)";
            syncBadge.style.borderColor = "rgba(16,185,129,0.2)";
            syncBadge.style.background = "rgba(16,185,129,0.1)";
            ui.showToast("Cloud sync complete: SQLite database ledger secured in cloud.", "success");
        }, 1500);
    });
}

// --- AUTO LOCK INACTIVITY TIMER ---
let inactivityTimer;
function startInactivityMonitor() {
    const resetTimer = () => {
        clearTimeout(inactivityTimer);
        // Only trigger inactivity auto-lock if user is authenticated and has a PIN configured
        if (store.isAuthenticated && store.state.requiresPin) {
            inactivityTimer = setTimeout(() => {
                store.setPinRequirements(store.state.requiresPin, false);
                evaluateAuthState();
                ui.showToast("Session auto-locked due to inactivity", "warning");
            }, 300000); // 5 minutes
        }
    };

    // Activity listeners
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keypress", resetTimer);
    window.addEventListener("click", resetTimer);
    window.addEventListener("scroll", resetTimer);
    
    // Reset timer when state updates
    store.subscribe(() => {
        resetTimer();
    });
}

// --- SUBMIT BUDGET FORMS HANDLERS ---
function bindBudgetFormEvents() {
    const overlay = document.getElementById("modal-overlay");
    const budgetForm = document.getElementById("budget-form");
    const catBudgetForm = document.getElementById("cat-budget-form");

    if (budgetForm) {
        budgetForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const budgetAmt = parseFloat(document.getElementById("monthly-budget-input").value);
            document.getElementById("global-loader").classList.remove("hidden");
            try {
                await api.user.updateProfile({ monthly_budget: budgetAmt });
                ui.showToast("Overall budget modified successfully", "success");
                overlay.classList.add("hidden");
                document.getElementById("budget-modal").classList.add("hidden");
                // Reload current view to show changes
                await navigateToView(currentActiveView);
            } catch (err) {
                ui.showToast(err.message, "error");
            } finally {
                document.getElementById("global-loader").classList.add("hidden");
            }
        });
    }

    if (catBudgetForm) {
        catBudgetForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const category = document.getElementById("cat-budget-select").value;
            const budgetAmt = parseFloat(document.getElementById("cat-budget-amount").value);
            document.getElementById("global-loader").classList.remove("hidden");
            try {
                await api.budgets.setCategoryBudget(category, budgetAmt);
                ui.showToast(`Set limit for ${category} successfully`, "success");
                overlay.classList.add("hidden");
                document.getElementById("cat-budget-modal").classList.add("hidden");
                // Reload current view to show changes
                await navigateToView(currentActiveView);
            } catch (err) {
                ui.showToast(err.message, "error");
            } finally {
                document.getElementById("global-loader").classList.add("hidden");
            }
        });
    }
}
