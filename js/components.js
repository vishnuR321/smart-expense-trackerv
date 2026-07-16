export const categoryIcons = {
    "Food": "utensils",
    "Transport": "car",
    "Shopping": "shopping-bag",
    "Entertainment": "film",
    "Recharge": "zap",
    "Medical": "heart-pulse",
    "Bills": "receipt",
    "Education": "graduation-cap",
    "Travel": "plane",
    "Fuel": "fuel",
    "Grocery": "shopping-cart",
    "Investment": "trending-up",
    "Others": "package"
};

export const ui = {
    showToast(message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;
        
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        
        let iconName = "info";
        if (type === "success") iconName = "check-circle";
        if (type === "warning") iconName = "alert-triangle";
        if (type === "error") iconName = "x-circle";
        
        toast.innerHTML = `
            <i data-lucide="${iconName}" class="insight-icon"></i>
            <div class="toast-message">${message}</div>
        `;
        
        container.appendChild(toast);
        if (window.lucide) window.lucide.createIcons({ attrs: { class: 'insight-icon' } });
        
        // Slide out and remove
        setTimeout(() => {
            toast.style.animation = "slideInRight 0.3s reverse forwards";
            toast.addEventListener("animationend", () => {
                toast.remove();
            });
        }, 4000);
    },

    renderExpenseCard(expense, currencySymbol = "$", actionsEnabled = true) {
        const icon = categoryIcons[expense.category] || "package";
        return `
            <div class="transaction-card glass-card" id="exp-${expense.id}">
                <div class="tr-left">
                    <div class="tr-icon ${expense.category}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="tr-details">
                        <span class="tr-title">${escapeHtml(expense.description)}</span>
                        <span class="tr-meta">${expense.date} • ${expense.time} • ${escapeHtml(expense.payment_method)}</span>
                    </div>
                </div>
                <div class="tr-right">
                    <span class="tr-amount">${currencySymbol}${expense.amount.toFixed(2)}</span>
                    ${actionsEnabled ? `
                    <div class="tr-actions">
                        <button class="btn-icon btn-compact edit-exp-btn" data-id="${expense.id}" title="Edit"><i data-lucide="edit-3"></i></button>
                        <button class="btn-icon btn-compact delete-exp-btn" data-id="${expense.id}" title="Delete"><i data-lucide="trash-2"></i></button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderExpenseGridCard(expense, currencySymbol = "$") {
        const icon = categoryIcons[expense.category] || "package";
        return `
            <div class="expense-grid-card glass-card" id="exp-grid-${expense.id}">
                <div class="grid-card-header">
                    <div class="tr-icon ${expense.category}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <span class="tr-meta">${expense.category}</span>
                </div>
                <div>
                    <h4 style="margin: 8px 0 4px 0; font-size: 16px;">${escapeHtml(expense.description)}</h4>
                    <span class="grid-card-amount">${currencySymbol}${expense.amount.toFixed(2)}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${expense.location ? `<p style="display:flex; align-items:center; gap: 4px;"><i data-lucide="map-pin" style="width:12px;height:12px;"></i> ${escapeHtml(expense.location)}</p>` : ''}
                    ${expense.notes ? `<p style="display:flex; align-items:center; gap: 4px; margin-top:2px;"><i data-lucide="sticky-note" style="width:12px;height:12px;"></i> ${escapeHtml(expense.notes)}</p>` : ''}
                </div>
                <div class="grid-card-footer">
                    <span>${expense.date} • ${expense.time}</span>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn-icon btn-compact edit-exp-btn" data-id="${expense.id}" title="Edit"><i data-lucide="edit-3"></i></button>
                        <button class="btn-icon btn-compact delete-exp-btn" data-id="${expense.id}" title="Delete"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            </div>
        `;
    },

    renderSkeleton(count = 3) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="transaction-card glass-card" style="pointer-events: none; opacity: 0.7;">
                    <div class="tr-left" style="width: 70%;">
                        <div class="tr-icon skeleton" style="width: 42px; height: 42px; border-radius: 10px; background: transparent;"></div>
                        <div class="tr-details" style="flex: 1; gap: 6px;">
                            <div class="skeleton" style="height: 14px; width: 60%; border-radius: 4px;"></div>
                            <div class="skeleton" style="height: 10px; width: 80%; border-radius: 4px;"></div>
                        </div>
                    </div>
                    <div class="tr-right">
                        <div class="skeleton" style="height: 18px; width: 60px; border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        }
        return html;
    },

    renderEmptyState(message = "No records found.") {
        return `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    },

    showConfirmModal(message, onConfirm) {
        const overlay = document.getElementById("modal-overlay");
        const confirmModal = document.getElementById("confirm-modal");
        const msgEl = document.getElementById("confirm-message");
        const yesBtn = document.getElementById("confirm-yes-btn");
        const cancelBtn = document.getElementById("confirm-cancel-btn");
        const closeBtn = confirmModal.querySelector(".close-modal-btn");
        
        if (!overlay || !confirmModal) return;
        
        msgEl.textContent = message;
        
        // Show modal
        overlay.classList.remove("hidden");
        confirmModal.classList.remove("hidden");
        
        const cleanUp = () => {
            confirmModal.classList.add("hidden");
            overlay.classList.add("hidden");
            // Remove event listeners
            yesBtn.removeEventListener("click", handleConfirm);
            cancelBtn.removeEventListener("click", handleCancel);
            closeBtn.removeEventListener("click", handleCancel);
        };
        
        const handleConfirm = () => {
            onConfirm();
            cleanUp();
        };
        
        const handleCancel = () => {
            cleanUp();
        };
        
        yesBtn.addEventListener("click", handleConfirm);
        cancelBtn.addEventListener("click", handleCancel);
        closeBtn.addEventListener("click", handleCancel);
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
