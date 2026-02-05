 const SUPABASE_URL = "https://xpruhdgniomsyeufwhtm.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwcnVoZGduaW9tc3lldWZ3aHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU1MDgsImV4cCI6MjA3ODE2MTUwOH0.3obk7zsBdWOty0T_ArDUBAcepOecaeO-duVEG6IthcI"; 
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function checkAuth(redirect = true) {
        const storedFirstName = localStorage.getItem('userFirstName');
        const storedRole = localStorage.getItem('userRole');
        const storedEmail = localStorage.getItem('userEmail');

        if (storedFirstName && storedRole) return { FirstName: storedFirstName, Role: storedRole, Email: storedEmail };

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) { if (redirect) window.location.href = "/Login.html"; return null; }

        const { data: userData } = await supabaseClient
            .from('UserAccount')
            .select('*')
            .eq('Email', session.user.email)
            .maybeSingle();

        if (!userData) { if (redirect) window.location.href = "/Login.html"; return null; }

        localStorage.setItem('userFirstName', userData.FirstName);
        localStorage.setItem('userRole', userData.Role);
        localStorage.setItem('userEmail', userData.Email);
        localStorage.setItem('userId', userData.UserAccountID);

        return userData;
    }

    // --- SHELL HELPERS (notification bell + logout) ---
    async function logout() {
        try { await supabaseClient.auth.signOut(); } catch (e) {}
        localStorage.clear();
        window.location.href = "/Login.html";
    }

    async function loadNotifications() {
        const bellBtn = document.getElementById("notifBellBtn");
        if (!bellBtn) return;

        const userId = localStorage.getItem("userId");
        if (!userId) return;

        const { data, error } = await supabaseClient
            .from("Notifications")
            .select("NotificationID, Message, Status, DateSent")
            .eq("UserAccountID", userId)
            .eq("Status", "Unread")
            .order("DateSent", { ascending: false })
            .limit(10);

        if (error) {
            console.error(error);
            return;
        }

        // badge
        document.getElementById("notif-badge")?.remove();
        if (data?.length) {
            const badge = document.createElement("span");
            badge.id = "notif-badge";
            badge.textContent = data.length;
            badge.className =
                "absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full";
            bellBtn.appendChild(badge);
        }

        // dropdown
        document.getElementById("notif-dropdown")?.remove();
        bellBtn.onclick = () => {
            const existing = document.getElementById("notif-dropdown");
            if (existing) return existing.remove();

            const dropdown = document.createElement("div");
            dropdown.id = "notif-dropdown";
            dropdown.className =
                "absolute right-4 top-[72px] w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto z-50";
            dropdown.style.maxHeight = "320px";

            if (!data?.length) {
                dropdown.innerHTML = `<div class="p-4 text-gray-500 text-sm">No new notifications</div>`;
            } else {
                data.forEach((n) => {
                    const item = document.createElement("button");
                    item.type = "button";
                    item.className =
                        "w-full text-left p-4 border-b last:border-b-0 hover:bg-gray-50 text-gray-900 text-sm";
                    item.textContent = n.Message;
                    item.onclick = async () => {
                        await supabaseClient
                            .from("Notifications")
                            .update({ Status: "Read" })
                            .eq("NotificationID", n.NotificationID);
                        dropdown.remove();
                        loadNotifications();
                    };
                    dropdown.appendChild(item);
                });
            }

            document.body.appendChild(dropdown);

            const onDocClick = (e) => {
                if (!dropdown.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener("click", onDocClick);
                }
            };
            setTimeout(() => document.addEventListener("click", onDocClick), 0);
        };
    }

    // --- STATE ---
    let issuedBills = [];     // rows from Billing
    let toIssue = [];         // rows from Appointment
    let currentSearchTerm = "";
    let filterStatus = "all";
    let issueContext = null; 

    // date filters
    let filterDateFrom = null;
    let filterDateTo = null;

    // tabs: 'toIssue' | 'issued'
    let currentTab = "toIssue";

    function setTab(tab) {
        currentTab = tab;

        const btnBraces = document.getElementById("tab-braces");
        const btnToIssue = document.getElementById('tab-to-issue');
        const btnIssued = document.getElementById('tab-issued');
        const hint = document.getElementById('tab-hint');
        const actionHeader = document.getElementById("col-action-header");
            if (actionHeader) {
            actionHeader.classList.toggle("hidden", tab === "issued");
            }

        if (tab === 'toIssue') {
            btnToIssue.className = "px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white";
            btnIssued.className = "px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50";
            hint.textContent = "To Issue: finished appointments with dentist-set price that don't have a bill yet.";

        } else if (tab === 'braces') {
            btnBraces.className = "px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white";
            btnToIssue.className = "px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50";
            btnIssued.className = "px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50";
            hint.textContent = "Braces plans awaiting ₱15,000 downpayment.";

        } else { // issued
            btnIssued.className = "px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white";
            btnToIssue.className = "px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50";
            hint.textContent = "Issued Bills.";
        }

        // status filter only makes sense for issued bills; disable for To Issue
        const statusSel = document.getElementById('filter-status');
        if (statusSel) {
            statusSel.disabled = (tab === 'toIssue');
            statusSel.classList.toggle('opacity-50', tab === 'toIssue');
        }

        renderTable();
    }

    function setStatusFilter(value) {
        filterStatus = value;
        renderTable();
    }

    function setDateFilter(which, value) {
        if (which === 'from') {
            if (value) {
                const d = new Date(value);
                d.setHours(0, 0, 0, 0);
                filterDateFrom = d;
            } else {
                filterDateFrom = null;
            }
        } else if (which === 'to') {
            if (value) {
                const d = new Date(value);
                d.setHours(23, 59, 59, 999);
                filterDateTo = d;
            } else {
                filterDateTo = null;
            }
        }
        renderTable();
    }

    function clearDateFilters() {
        filterDateFrom = null;
        filterDateTo = null;
        const fromInput = document.getElementById('filter-date-from');
        const toInput = document.getElementById('filter-date-to');
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        renderTable();
    }

    function handleSearch(term) {
        currentSearchTerm = term || "";
        renderTable();
    }

    // --- UTILITY FUNCTIONS ---
    function formatCurrency(amount) {
        const n = Number(amount || 0);
        return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
    }

    function formatCurrency2(amount) {
    const n = Number(amount || 0);
    return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }


    function peso(amount) { return formatCurrency(amount); }

    function getStatusBadge(status) {
        let colorClass;
        const s = (status || '').toLowerCase();

        if (s === "paid") colorClass = "bg-green-100 text-green-800";
        else if (s === "unpaid") colorClass = "bg-yellow-100 text-yellow-800";
        else if (s === "pending") colorClass = "bg-yellow-100 text-yellow-800";
        else if (s === "void") colorClass = "bg-gray-200 text-gray-700";
        else colorClass = "bg-gray-100 text-gray-800";

        const label = s ? (s.charAt(0).toUpperCase() + s.slice(1)) : "-";
        return `<span class="${colorClass} text-xs font-semibold px-2.5 py-0.5 rounded-full">${label}</span>`;
    }


    function getMethodBadge(method) {
        if (!method) return '<span class="text-xs text-gray-500">-</span>';

        const m = String(method).toUpperCase();
        let colorClass = "bg-gray-100 text-gray-800";

        if (m === "GCASH") colorClass = "bg-sky-100 text-sky-800";
        else if (m === "CASH") colorClass = "bg-emerald-100 text-emerald-800";
        else if (m === "CARD") colorClass = "bg-purple-100 text-purple-800";

        return `
            <span class="${colorClass} text-[11px] font-semibold px-2 py-0.5 rounded-full">
            ${m}
            </span>
        `;
    }
const _profileUrlCache = new Map(); // path -> signedUrl OR "__MISSING__"

async function getProfileSignedUrl(path) {
  if (!path) return "";

  const cached = _profileUrlCache.get(path);
  if (cached) return cached === "__MISSING__" ? "" : cached;

  const { data, error } = await supabaseClient
    .storage
    .from("Logo")
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    _profileUrlCache.set(path, "__MISSING__");

    return "";
  }

  _profileUrlCache.set(path, data.signedUrl);
  return data.signedUrl;
}



    function formatDateTime(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function closeApptModal() {
  const modal = document.getElementById("appt-modal");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
  const content = document.getElementById("appt-modal-content");
  if (content) content.innerHTML = "";
}

function openApptModal(billingId) {
  const row = issuedBills.find(b => String(b.BillingID) === String(billingId));
  if (!row) return;

  const appt = row.Appointment || {};
  const user = appt.UserAccount || {};

  const patientName =
    `${user.FirstName || ""} ${user.LastName || ""}`.trim() || "Unknown";
    const ref = row.paymentreference || "-";

  const txn = appt.TransactionID || appt.AppointmentID || "-";
  const service = appt.Service || "-";
  const schedule = formatDateTime(appt.AppointmentSchedule);
  const dentist =
  appt.Dentist
    ? `${appt.Dentist.FirstName || ""} ${appt.Dentist.LastName || ""}`.trim()
    : "—";
  let typeLabel = String(row.PaymentType || "-").toUpperCase();
  if (typeLabel === "DOWNPAYMENT" || typeLabel === "APPOINTMENT_FEE") typeLabel = "APPOINTMENT FEE";

  const status = String(row.PaymentStatus || "-").toUpperCase();
  const method = String(row.PaymentMethod || "-").toUpperCase();
  const issuedAt = formatDateTime(row.DateIssued);
  const amount = Number(row.Amount || 0);

  const { addons, extraServices } = splitAddOns(appt.AddOns);

  const extraHtml = extraServices.length
    ? `
      <div class="rounded-xl border p-4">
        <div class="font-semibold text-gray-900 mb-2">Additional Services</div>
        <div class="space-y-2">
          ${extraServices.map(a => `
            <div class="flex items-center justify-between text-sm">
              <span>${escapeHtml(a?.name || "Service")}</span>
              <span class="font-semibold">${formatCurrency2(a?.price || 0)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `
    : `
      <div class="rounded-xl border p-4">
        <div class="font-semibold text-gray-900 mb-1">Additional Services</div>
        <div class="text-sm text-gray-500">None</div>
      </div>
    `;

  const addonsHtml = addons.length
    ? `
      <div class="rounded-xl border p-4">
        <div class="font-semibold text-gray-900 mb-2">Add-ons</div>
        <div class="space-y-2">
          ${addons.map(a => `
            <div class="flex items-center justify-between text-sm">
              <span>${escapeHtml(a?.name || "Add-on")}</span>
              <span class="font-semibold">${formatCurrency2(a?.price || 0)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `
    : `
      <div class="rounded-xl border p-4">
        <div class="font-semibold text-gray-900 mb-1">Add-ons</div>
        <div class="text-sm text-gray-500">No add-ons</div>
      </div>
    `;


  const content = document.getElementById("appt-modal-content");
  if (!content) return;

  content.innerHTML = `
    <div class="rounded-xl border bg-gray-50 p-4 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Patient</div>
        <div class="font-semibold text-gray-900">${escapeHtml(patientName)}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Transaction No.</div>
        <div class="font-mono text-sm text-gray-900">${escapeHtml(txn)}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Service</div>
        <div class="font-medium text-gray-800">${escapeHtml(service)}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Schedule</div>
        <div class="text-gray-700">${escapeHtml(schedule)}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Dentist</div>
        <div class="text-gray-700 font-medium">${escapeHtml(dentist)}</div>
      </div>
    </div>

    <div class="rounded-xl border p-4 space-y-2">
      <div class="font-semibold text-gray-900 mb-1">Linked Payment</div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Type</span>
        <span class="font-semibold">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Amount</span>
        <span class="font-semibold">${formatCurrency2(amount)}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Method</span>
        <span class="font-semibold">${escapeHtml(method)}</span>
      </div>
      ${method === "GCASH" ? `
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">GCash Ref</span>
          <span class="font-semibold">${escapeHtml(ref)}</span>
        </div>
      ` : ""}
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Status</span>
        <span class="font-semibold">${escapeHtml(status)}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Issued</span>
        <span class="font-semibold">${escapeHtml(issuedAt)}</span>
      </div>
    </div>
    ${extraHtml}
    ${addonsHtml}
  `;

  const modal = document.getElementById("appt-modal");
  modal?.classList.remove("hidden");
  modal?.classList.add("flex");
}


    function calculateSummaryForIssued(rows) {
        const totalRevenue = rows
            .filter(r => (r.PaymentStatus || '').toUpperCase() === 'PAID')
            .reduce((sum, r) => sum + Number(r.Amount || 0), 0);

        const paidCount = rows.filter(r => (r.PaymentStatus || '').toUpperCase() === 'PAID').length;

        const pendingAmount = rows
            .filter(r => (r.PaymentStatus || '').toUpperCase() === 'UNPAID')
            .reduce((sum, r) => sum + Number(r.Amount || 0), 0);

        return { totalRevenue, completedTransactionsCount: paidCount, pendingAmount };
    }

    function calculateSummaryForToIssue(rows) {
        const totalToIssue = rows.reduce((sum, r) => sum + Number(r.TotalAmount || 0), 0);
        return {
            totalRevenue: 0,
            completedTransactionsCount: rows.length,
            pendingAmount: totalToIssue
        };
    }

    function renderSummaryStats(summary, mode = "issued") {
        const container = document.getElementById('summary-stats');

        // Reuse the same 3 cards but rename based on mode
        if (mode === "toIssue") {
            container.innerHTML = `
                <div class="rounded-xl border bg-white shadow-lg p-6">
                    <h3 class="text-sm font-medium text-gray-600 pb-3">To Issue (Count)</h3>
                    <div class="text-3xl font-bold text-primary">${summary.completedTransactionsCount}</div>
                    <p class="text-xs text-gray-500 mt-2">Finished appointments ready for billing</p>
                </div>

                <div class="rounded-xl border bg-white shadow-lg p-6">
                    <h3 class="text-sm font-medium text-gray-600 pb-3">Total To Issue</h3>
                    <div class="text-3xl font-bold text-yellow-600">${formatCurrency(summary.pendingAmount)}</div>
                    <p class="text-xs text-gray-500 mt-2">Sum of dentist-set prices</p>
                </div>

                <div class="rounded-xl border bg-white shadow-lg p-6">
                    <h3 class="text-sm font-medium text-gray-600 pb-3">Issued Bills</h3>
                    <div class="text-3xl font-bold text-green-600">${issuedBills.length}</div>
                    <p class="text-xs text-gray-500 mt-2">Bills already created</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="rounded-xl border bg-white shadow-lg p-6">
                <h3 class="text-sm font-medium text-gray-600 pb-3">Total Revenue</h3>
                <div class="text-3xl font-bold text-primary">${formatCurrency(summary.totalRevenue)}</div>
                <p class="text-xs text-gray-500 mt-2">From PAID bills</p>
            </div>

            <div class="rounded-xl border bg-white shadow-lg p-6">
                <h3 class="text-sm font-medium text-gray-600 pb-3">Paid Bills</h3>
                <div class="text-3xl font-bold text-green-600">${summary.completedTransactionsCount}</div>
                <p class="text-xs text-gray-500 mt-2">Successfully processed</p>
            </div>

            <div class="rounded-xl border bg-white shadow-lg p-6">
                <h3 class="text-sm font-medium text-gray-600 pb-3">Unpaid Amount</h3>
                <div class="text-3xl font-bold text-yellow-600">${formatCurrency(summary.pendingAmount)}</div>
                <p class="text-xs text-gray-500 mt-2">Awaiting payment</p>
            </div>
        `;
    }

    // --- LOAD DATA ---
    async function loadIssuedBills() {
        const { data, error } = await supabaseClient
            .from('Billing')
            .select(`
                BillingID,
                UserAccountID,
                AppointmentID,
                Amount,
                PaymentType,
                PaymentMethod,
                PaymentStatus,
                paymentreference,
                DateIssued,
                  Appointment:AppointmentID (
                    AppointmentID,
                    TransactionID,
                    AppointmentSchedule,
                    Service,
                    AddOns,
                    Dentist:DentistID( FirstName, LastName ),
                    UserAccount:UserAccountID ( UserAccountID, FirstName, LastName, Email, ContactNumber, ProfileImagePath )
                )
            `)
            .order('DateIssued', { ascending: false });

        if (error) {
            console.error('Error loading Billing data:', error);
            showMessage('Failed to load issued bills.', 'error');
            issuedBills = [];
            return;
        }

        issuedBills = data || [];
    }

function renderPatientCell(p) {
  const name = (p?.name || "Unknown").trim() || "Unknown";
  const email = p?.email || "-";
  const contact = p?.contact || "-";
  const txn = p?.transactionId || "-";
  const profilePath = p?.profilePath || "";
  const patientId = p?.patientId || "";

  // Give each tooltip a unique image id so we can set src later
  const imgId = `pp_${Math.random().toString(36).slice(2)}`;

  return `
    <div class="relative group inline-block"
         onmouseenter="hydrateTooltipProfileImg('${escapeHtml(profilePath)}','${imgId}','${escapeHtml(patientId)}')">
      <span class="font-medium text-gray-900">${escapeHtml(name)}</span>

      <div
        class="absolute left-full top-1/2 ml-3 -translate-y-1/2
               hidden group-hover:block
               w-72 bg-gray-900 text-white text-xs
               rounded-lg p-3 shadow-xl z-50"
      >
        <div class="flex items-start gap-3 mb-3">
          <div class="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
            <img id="${imgId}" class="w-full h-full object-cover hidden" alt="Profile" />
            <span class="text-[10px] text-white/70" data-fallback="1">N/A</span>
          </div>

          <div class="min-w-0">
            <div class="text-gray-300 text-[11px]">Patient</div>
            <div class="font-semibold text-sm leading-tight break-words">${escapeHtml(name)}</div>
          </div>
        </div>

        <div class="mb-2">
          <div class="text-gray-400">Email</div>
          <div class="font-semibold break-all">${escapeHtml(email)}</div>
        </div>

        <div class="mb-2">
          <div class="text-gray-400">Contact No.</div>
          <div class="font-semibold">${escapeHtml(contact)}</div>
        </div>

        <div>
          <div class="text-gray-400">Transaction No.</div>
          <div class="font-mono text-[11px] break-all">${escapeHtml(txn)}</div>
        </div>
      </div>
    </div>
  `;
}
async function hydrateTooltipProfileImg(profilePath, imgId) {
  if (!profilePath || !profilePath.trim()) return;

  const img = document.getElementById(imgId);
  if (!img) return;
  if (img.dataset.loaded === "1") return;
  img.dataset.loaded = "1"; // ✅ set early to avoid repeat spam

  const url = await getProfileSignedUrl(profilePath);
  if (!url) return;

  img.src = url;
  img.classList.remove("hidden");
  img.parentElement?.querySelector('[data-fallback="1"]')?.classList.add("hidden");
}

function safeParseAddons(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function splitAddOns(raw) {
  const all = safeParseAddons(raw);
  return {
    addons: all.filter(a => !a?.kind || a.kind === "addon"),
    extraServices: all.filter(a => a?.kind === "service"),
  };
}


    async function loadToIssue() {
        // Get billing appointment IDs to exclude
        const { data: billRows, error: billErr } = await supabaseClient
        .from('Billing')
        .select('AppointmentID, PaymentType')
        .eq('PaymentType', 'BILL');

        if (billErr) {
            console.error('Error loading Billing IDs:', billErr);
            showMessage('Failed to load billing references.', 'error');
            toIssue = [];
            return;
        }

        const billedIds = new Set((billRows || []).map(r => r.AppointmentID).filter(Boolean));

        // Load finished appointments with dentist-set price
        const { data: appts, error } = await supabaseClient
            .from('Appointment')
              .select(`
                AppointmentID,
                UserAccountID,
                AppointmentSchedule,
                Service,
                Status,
                TotalAmount,
                AddOns,
                UserAccount:UserAccountID ( FirstName, LastName, ProfileImagePath )
              `)
            .eq('Status', 'Finished')
            .gt('TotalAmount', 0)
            .order('AppointmentSchedule', { ascending: false });

        if (error) {
            console.error('Error loading appointments:', error);
            showMessage('Failed to load appointments to issue.', 'error');
            toIssue = [];
            return;
        }

        toIssue = (appts || []).filter(a => !billedIds.has(a.AppointmentID));
    }

    // --- ACTION: ISSUE BILL ---
async function issueBill(appointmentId) {
  try {
    const appt = toIssue.find(a => a.AppointmentID === appointmentId);
    if (!appt) {
      showMessage("Appointment not found in To Issue list.", "error");
      return;
    }

    const patientName =
      ((appt.UserAccount?.FirstName || "") + " " + (appt.UserAccount?.LastName || "")).trim() || "Unknown";

    const total = Number(appt.TotalAmount || 0);

    openIssueModal({ appt, patientName, total });
  } catch (e) {
    console.error(e);
    showMessage("Unexpected error while preparing bill.", "error");
  }
}

function openIssueModal(context) {
  issueContext = context;

  const { appt, patientName, total } = context;

  // Compute addons AFTER we have appt + total
  const { addons, extraServices } = splitAddOns(appt.AddOns);

  const addonsTotal = addons.reduce((s, a) => s + Number(a?.price || 0), 0);
  const extraTotal  = extraServices.reduce((s, a) => s + Number(a?.price || 0), 0);

  const base = Math.max(0, Number(total || 0) - addonsTotal - extraTotal);

  const addonsNames = addons
  .map(a => (a?.name || "").trim())
  .filter(Boolean)
  .join(", ");

const addonsLabel = addonsNames ? `Add-ons (${escapeHtml(addonsNames)})` : "Add-ons";

  const addonsHtml = addons.length
    ? `
      <div class="rounded-xl border p-4 bg-gray-50 mt-3">
        <div class="font-semibold text-gray-900 mb-2">Add-ons</div>
        <div class="space-y-2">
          ${addons.map(a => `
            <div class="flex items-center justify-between text-sm">
              <span>${escapeHtml(a?.name || "Add-on")}</span>
              <span class="font-semibold">${peso(a?.price || 0)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `
    : `<div class="text-sm text-gray-500 mt-2">No add-ons</div>`;

    const extraHtml = extraServices.length
  ? `
    <div class="rounded-xl border p-4 bg-gray-50 mt-3">
      <div class="font-semibold text-gray-900 mb-2">Additional Services</div>
      <div class="space-y-2">
        ${extraServices.map(a => `
          <div class="flex items-center justify-between text-sm">
            <span>${escapeHtml(a?.name || "Service")}</span>
            <span class="font-semibold">${peso(a?.price || 0)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `
  : `<div class="text-sm text-gray-500 mt-2">No additional services</div>`;


  const content = document.getElementById("issue-modal-content");
  content.innerHTML = `
    <div class="rounded-xl border bg-gray-50 p-4 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Patient</div>
        <div class="font-semibold text-gray-900">${escapeHtml(patientName)}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Service</div>
        <div class="font-medium text-gray-800">${escapeHtml(appt.Service || "-")}</div>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">Schedule</div>
        <div class="text-gray-700">${escapeHtml(formatDateTime(appt.AppointmentSchedule))}</div>
      </div>
    </div>

    <div class="rounded-xl border p-4">
      <div class="font-semibold text-gray-900 mb-2">Payment Method</div>

      <div id="gcash-ref-wrap" class="hidden mt-3">
        <label class="block text-xs text-gray-500 mb-1">
          GCash Reference Number
        </label>
        <input
          id="gcash-ref"
          type="text"
          placeholder="Enter GCash reference number"
          class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <label class="block text-xs text-gray-500 mb-1">Select method</label>
      <select
        id="issue-payment-method"
        class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">-- Choose payment method --</option>
        <option value="CASH">Cash</option>
        <option value="GCASH">GCash</option>
        <option value="CARD">Card</option>
      </select>

      <p class="text-xs text-gray-500 mt-2">
        This will be saved to the bill record.
      </p>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <input id="issue-mark-paid" type="checkbox" class="w-4 h-4 accent-[#03555E]" />
      <label for="issue-mark-paid" class="text-sm text-gray-700">
        Mark as <span class="font-semibold">PAID</span> now
      </label>
    </div>
    <p class="text-xs text-gray-500 mt-1">
      If unchecked, the bill will be issued as UNPAID.
    </p>

<div class="rounded-xl border p-4">
  <div class="font-semibold text-gray-900 mb-3">Breakdown</div>

  <!-- Base service -->
  <div class="mb-3">
    <div class="text-xs text-gray-500">Base service</div>
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-900">${escapeHtml(appt.Service || "-")}</div>
      <div class="text-sm font-semibold">${peso(base)}</div>
    </div>
  </div>

  <!-- Additional services -->
  <div class="mb-3">
    <div class="text-xs text-gray-500 mb-1">Additional services</div>
    ${
      extraServices.length
        ? extraServices.map(s => `
            <div class="flex items-center justify-between text-sm py-1">
              <div class="text-gray-900">${escapeHtml((s?.name || "").trim() || "Service")}</div>
              <div class="font-semibold">${peso(s?.price || 0)}</div>
            </div>
          `).join("")
        : `<div class="text-sm text-gray-500">None</div>`
    }
  </div>

  <!-- Add-ons -->
  <div class="mb-3">
    <div class="text-xs text-gray-500 mb-1">Add-ons</div>
    ${
      addons.length
        ? addons.map(a => `
            <div class="flex items-center justify-between text-sm py-1">
              <div class="text-gray-900">${escapeHtml((a?.name || "").trim() || "Add-on")}</div>
              <div class="font-semibold">${peso(a?.price || 0)}</div>
            </div>
          `).join("")
        : `<div class="text-sm text-gray-500">None</div>`
    }
  </div>

  <!-- Total -->
  <div class="flex items-center justify-between border-t pt-3 mt-3">
    <div class="font-semibold text-gray-900">TOTAL</div>
    <div class="font-extrabold text-lg">${peso(total)}</div>
  </div>
</div>
  `;

    const methodSel = document.getElementById("issue-payment-method");
const gcashWrap = document.getElementById("gcash-ref-wrap");

if (methodSel && gcashWrap) {
  methodSel.onchange = () => {
    gcashWrap.classList.toggle("hidden", methodSel.value !== "GCASH");
  };
}

  const modal = document.getElementById("issue-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

async function loadBracesDownpayments() {
  const { data: plans, error: planErr } = await supabaseClient
    .from("TreatmentPlan")
    .select("TreatmentPlanID, UserAccountID, DownpaymentAmount, Status, DownpaymentStatus, CreatedAt, SourceAppointmentID")
    .eq("PlanType", "BRACES")
    .eq("DownpaymentStatus", "UNPAID")
    .order("CreatedAt", { ascending: false });

  if (planErr) {
    console.error(planErr);
    bracesPlans = [];
    return;
  }

  const userIds = [...new Set((plans || []).map(p => p.UserAccountID).filter(Boolean))];

  let usersById = {};
  if (userIds.length) {
    const { data: users, error: userErr } = await supabaseClient
      .from("UserAccount")
      .select("UserAccountID, FirstName, LastName, ProfileImagePath")
      .in("UserAccountID", userIds);

    if (userErr) console.error(userErr);
    else usersById = Object.fromEntries((users || []).map(u => [u.UserAccountID, u]));
  }

  bracesPlans = (plans || []).map(p => ({
    ...p,
    UserAccount: usersById[p.UserAccountID] || null
  }));
}


function closeIssueModal() {
  issueContext = null;
  const modal = document.getElementById("issue-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function printReceipt(billingId) {
  const row = issuedBills.find(b => String(b.BillingID) === String(billingId));
  if (!row) { alert("Receipt data not found."); return; }

  if (String(row.PaymentStatus || "").toUpperCase() !== "PAID") {
    alert("Only PAID bills can be printed.");
    return;
  }

  const appt = row.Appointment || {};
  const user = appt.UserAccount || {};

  const patientName =
    ((user.FirstName || "") + " " + (user.LastName || "")).trim() || "Unknown";
    const ref = row.paymentreference || "";

  // Use Appointment.TransactionID as the receipt number
  const txnNo = appt.TransactionID || appt.AppointmentID || row.BillingID || "-";

  let typeLabel = String(row.PaymentType || "-").toUpperCase();
  if (typeLabel === "DOWNPAYMENT" || typeLabel === "APPOINTMENT_FEE") {
    typeLabel = "APPOINTMENT FEE";
  }

  const amount = Number(row.Amount || 0);
  const method = String(row.PaymentMethod || "-").toUpperCase();
  const issuedAt = formatDateTime(row.DateIssued);
  const service = appt.Service || "-";
  const schedule = formatDateTime(appt.AppointmentSchedule);
  
// ✅ ADD-ONS (insert here)
const { addons, extraServices } = splitAddOns(appt.AddOns);

const addonsTotal = addons.reduce((s, a) => s + Number(a?.price || 0), 0);
const extraTotal  = extraServices.reduce((s, a) => s + Number(a?.price || 0), 0);


const addonsLines = addons.length
  ? addons.map(a => `
      <div class="trow">
        <div>Add-on: ${escapeHtml(a?.name || "Add-on")}</div>
        <div><b>${formatCurrency2(a?.price || 0)}</b></div>
      </div>
    `).join("")
  : "";

const extraLines = extraServices.length
  ? extraServices.map(a => `
      <div class="trow">
        <div>Additional Service: ${escapeHtml(a?.name || "Service")}</div>
        <div><b>${formatCurrency2(a?.price || 0)}</b></div>
      </div>
    `).join("")
  : "";

const extraTotalLine = extraServices.length
  ? `
    <div class="trow">
      <div><b>Additional Services Total</b></div>
      <div><b>${formatCurrency2(extraTotal)}</b></div>
    </div>
  `
  : "";


const addonsTotalLine = addons.length
  ? `
    <div class="trow">
      <div><b>Add-ons Total</b></div>
      <div><b>${formatCurrency2(addonsTotal)}</b></div>
    </div>
  `
  : "";


  // Optional: clinic details (edit these)
  const clinicName = "Happy Tooth Dae Dental Clinic";
  const clinicLogoUrl = "/Image/logo.png"; // <-- uses same path as your site header
  const clinicAddr = "Unit C Lot 1, Maligaya Park Homes, Block 38 Sampaguita, Novaliches, Quezon City, 1118 Metro Manila";
  const clinicPhone = "Contact: 09154693574";

  const html =
    '<html><head><title>Official Receipt</title>' +
    '<meta charset="utf-8" />' +
    '<style>' +
      'body{font-family:Arial,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111}' +
      '.wrap{max-width:720px;margin:0 auto}' +
      '.card{background:#fff;border:1px solid #e6e8ee;border-radius:14px;box-shadow:0 10px 24px rgba(0,0,0,.06)}' +
      '.header{padding:18px 20px;border-bottom:1px solid #eef0f4;display:flex;justify-content:space-between;gap:12px}' +
      '.brand h1{margin:0;font-size:18px;letter-spacing:.2px}' +
      '.brand .sub{margin-top:4px;font-size:12px;color:#666;line-height:1.4}' +
      '.doc{text-align:right}' +
      '.doc .title{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.12em}' +
      '.doc .no{margin-top:6px;font-size:16px;font-weight:700}' +
      '.body{padding:18px 20px}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}' +
      '.box{border:1px solid #eef0f4;border-radius:12px;padding:12px}' +
      '.label{font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.08em}' +
      '.value{margin-top:6px;font-size:13px;color:#111;word-break:break-word}' +
      '.table{margin-top:14px;border:1px solid #eef0f4;border-radius:12px;overflow:hidden}' +
      '.trow{display:flex;justify-content:space-between;padding:10px 12px;border-top:1px solid #eef0f4;font-size:13px}' +
      '.trow:first-child{border-top:none;background:#fafbfc;font-weight:700}' +
      '.totals{margin-top:14px;border:1px solid #eef0f4;border-radius:12px;padding:12px}' +
      '.totline{display:flex;justify-content:space-between;margin:6px 0;font-size:13px}' +
      '.totline strong{font-size:16px}' +
      '.foot{padding:14px 20px;border-top:1px dashed #e6e8ee;color:#667085;font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
      '@media print{body{background:#fff;padding:0}.card{box-shadow:none;border:1px solid #ddd}}' +
    '</style></head><body>' +
    '<div class="wrap">' +
      '<div class="card">' +
        '<div class="header">' +
            '<div class="brand" style="display:flex;gap:12px;align-items:center">' +
              '<img src="' + escapeHtml(clinicLogoUrl) + '" alt="Logo" style="width:44px;height:44px;object-fit:contain;border-radius:10px;border:1px solid #eef0f4" />' +
              '<div>' +
                '<h1 style="margin:0;font-size:18px;letter-spacing:.2px">' + escapeHtml(clinicName) + '</h1>' +
                '<div class="sub">' +
                  escapeHtml(clinicAddr) + '<br />' +
                  escapeHtml(clinicPhone) +
                '</div>' +
              '</div>' +
            '</div>' +
          '<div class="doc">' +
            '<div class="title">Official Receipt</div>' +
            '<div class="no">' + escapeHtml(String(txnNo)) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="body">' +
          '<div class="grid">' +
            '<div class="box">' +
              '<div class="label">Billed To</div>' +
              '<div class="value"><b>' + escapeHtml(patientName) + '</b></div>' +
            '</div>' +
            '<div class="box">' +
              '<div class="label">Payment Details</div>' +
              '<div class="value">' +
                '<div><b>Method:</b> ' + escapeHtml(method) + '</div>' +
                (method === "GCASH" && ref
                  ? '<div><b>GCash Ref:</b> ' + escapeHtml(ref) + '</div>'
                  : ''
                ) +
                '<div><b>Status:</b> PAID</div>' +
                '<div><b>Date:</b> ' + escapeHtml(issuedAt) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

            '<div class="table">' +
              '<div class="trow">' +
                '<div>Description</div>' +
                '<div>Amount</div>' +
              '</div>' +
              '<div class="trow">' +
                '<div>' + escapeHtml(typeLabel) + ' • ' + escapeHtml(service) + '</div>' +
                '<div><b>' + formatCurrency2(amount) + '</b></div>'+
              '</div>' +
              extraLines +
              extraTotalLine +
              addonsLines +
              addonsTotalLine +
              '</div>' +

          '<div class="totals">' +
            '<div class="totline"><div class="label" style="text-transform:none;letter-spacing:0;color:#667085">Appointment Schedule</div>' +
            '<div>' + escapeHtml(schedule) + '</div></div>' +
            '<div class="totline"><div class="label" style="text-transform:none;letter-spacing:0;color:#667085">Total Paid</div>' +
            '<div><strong>' + formatCurrency2(amount) + '</strong></div>'
          '</div>' +
        '</div>' +

        '<div class="foot">' +
          '<div>Transaction No.: <b>' + escapeHtml(String(txnNo)) + '</b></div>' +
          '<div>This receipt is system-generated and valid without signature.</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</body></html>';

  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) { alert("Popup blocked. Allow popups to print receipts."); return; }

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}



async function confirmIssueBill() {
  if (!issueContext) return;
  const isBraces = issueContext?.mode === "braces";
  const btn = document.getElementById("issue-confirm-btn");
  btn.disabled = true;
  btn.classList.add("opacity-70", "cursor-not-allowed");
showLoading("Issuing bill…", "Please wait");
  try {
    const { appt, total } = issueContext;

    const billAmount = Number(total || 0);

    const methodEl = document.getElementById("issue-payment-method");
    const paymentMethod = (methodEl?.value || "").trim();

      if (!paymentMethod) {
      showMessage("Please select a payment method (Cash, GCash, or Card).", "error");
      btn.disabled = false;
      btn.classList.remove("opacity-70", "cursor-not-allowed");
      return;
    }

    let gcashRef = null;

if (paymentMethod === "GCASH") {
  const refEl = document.getElementById("gcash-ref");
  gcashRef = (refEl?.value || "").trim();

  if (!gcashRef) {
    showMessage("Please enter the GCash reference number.", "error");
    btn.disabled = false;
    btn.classList.remove("opacity-70", "cursor-not-allowed");
    return;
  }
}


    const paidEl = document.getElementById("issue-mark-paid");
    const isPaidNow = !!paidEl?.checked;

    if (isBraces && !appt?.AppointmentID) {
      showMessage(
        "This braces plan has no SourceAppointmentID. Create the braces plan from the consultation appointment (it must save AppointmentID).",
        "error"
      );
      btn.disabled = false;
      btn.classList.remove("opacity-70", "cursor-not-allowed");
      return;
    }

    const { error } = await supabaseClient
      .from("Billing")
    .insert({
      AppointmentID: appt.AppointmentID,
      UserAccountID: appt.UserAccountID,
      PaymentType: "BILL",
      Amount: billAmount,
      PaymentStatus: isPaidNow ? "PAID" : "UNPAID",
      PaymentMethod: paymentMethod,
      paymentreference: gcashRef,
      DateIssued: new Date().toISOString()
    });

    if (error) {
      console.error(error);
      showMessage(error.message || "Failed to issue bill.", "error");
      return;
    }

    showMessage(isPaidNow ? "Bill issued and marked PAID." : "Bill issued successfully.", "success");
    closeIssueModal();
    await refreshAll();
  } catch (e) {
    console.error(e);
    showMessage("Unexpected error while issuing bill.", "error");
  } finally {
    hideLoading();
    btn.disabled = false;
    btn.classList.remove("opacity-70", "cursor-not-allowed");
  }
}

async function refreshAll() {
  showLoading("Refreshing billing…", "Please wait");
  try {
    await Promise.all([
      loadIssuedBills(),
      loadToIssue(),
    ]);
    renderTable();
  } finally {
    hideLoading();
  }
}


    // --- RENDER TABLE ---
    function renderTable() {
        const tableBody = document.getElementById('transactions-table-body');
        const term = (currentSearchTerm || "").toLowerCase();

        if (currentTab === "braces") {
          renderSummaryStats({
            totalRevenue: 0,
            completedTransactionsCount: bracesPlans.length,
            pendingAmount: bracesPlans.reduce((s, p) => s + Number(p.DownpaymentAmount || 0), 0)
          }, "toIssue");

          if (!bracesPlans.length) {
            tableBody.innerHTML =
              '<tr><td colspan="7" class="text-center text-gray-500 py-8">No braces downpayments pending.</td></tr>';
            return;
          }

          tableBody.innerHTML = bracesPlans.map(p => {
            const patientName =
              `${p.UserAccount?.FirstName || ""} ${p.UserAccount?.LastName || ""}`.trim() || "Unknown";

            return `
              <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-4 font-medium">${patientName}</td>
                <td class="py-3 px-4">Braces Treatment Plan</td>
                <td class="py-3 px-4 font-semibold">${formatCurrency(p.DownpaymentAmount)}</td>
                <td class="py-3 px-4 text-sm text-gray-600">${formatDateTime(p.CreatedAt)}</td>
                <td class="py-3 px-4">${getMethodBadge(null)}</td>
                <td class="py-3 px-4">${getStatusBadge("unpaid")}</td>
                <td class="py-3 px-4 text-right">
                  <button
                    class="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary-dark"
                    onclick="openBracesDownpaymentModal('${p.TreatmentPlanID}')"  
                  >
                    Mark Paid
                  </button>
                </td>
              </tr>
            `;
          }).join("");
          return;
        }

        if (currentTab === 'toIssue') {
            let rows = toIssue.slice();

            // Search: patient or service
            if (term) {
                rows = rows.filter(a => {
                    const patient = `${a.UserAccount?.FirstName || ''} ${a.UserAccount?.LastName || ''}`.toLowerCase();
                    const service = String(a.Service || '').toLowerCase();
                    return patient.includes(term) || service.includes(term);
                });
            }

            // Date filters based on AppointmentSchedule
            rows = rows.filter(a => {
                const dv = a.AppointmentSchedule ? new Date(a.AppointmentSchedule).getTime() : null;
                if (!dv) return true;
                if (filterDateFrom && dv < filterDateFrom.getTime()) return false;
                if (filterDateTo && dv > filterDateTo.getTime()) return false;
                return true;
            });

            renderSummaryStats(calculateSummaryForToIssue(rows), "toIssue");

            if (rows.length === 0) {
                tableBody.innerHTML =
                    '<tr><td colspan="7" class="text-center text-gray-500 py-8">No appointments ready to issue.</td></tr>';
                return;
            }

            tableBody.innerHTML = rows.map(a => {
                const patientName = `${a.UserAccount?.FirstName || ''} ${a.UserAccount?.LastName || ''}`.trim() || 'Unknown';
                return `
                    <tr class="border-b hover:bg-gray-50 transition-colors">
                        <td class="py-3 px-4 font-medium">${patientName}</td>
                        <td class="py-3 px-4">${getTypeBadge(a.Service || 'Service')}</td>
                        <td class="py-3 px-4 font-semibold text-gray-800">${formatCurrency(a.TotalAmount || 0)}</td>
                        <td class="py-3 px-4 text-sm text-gray-600">${formatDateTime(a.AppointmentSchedule)}</td>
                        <td class="py-3 px-4">${getMethodBadge(null)}</td>
                        <td class="py-3 px-4">${getStatusBadge('unpaid')}</td>
                        <td class="py-3 px-4 text-right space-x-2">
                            <button
                                class="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary-dark"
                                onclick="issueBill('${a.AppointmentID}')"
                            >
                                Issue Bill
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // issued bills tab
let rows = issuedBills.map(row => {
  const appt = row.Appointment || {};
  const user = appt.UserAccount || null;
  const apptWhen = appt.AppointmentSchedule ? formatDateTime(appt.AppointmentSchedule) : "-";
  const { extraServices } = splitAddOns(appt.AddOns);
  const extraCount = extraServices.length;

  const extraServiceNames = extraServices
    .map(s => (s?.name || "").trim())
    .filter(n => n.length > 0);

  const patientName = user
    ? `${user.FirstName || ''} ${user.LastName || ''}`.trim() || 'Unknown'
    : 'Unknown';

  const service = appt.Service || '-';
  const status = (row.PaymentStatus || '').toLowerCase();
  const dv = row.DateIssued ? new Date(row.DateIssued).getTime() : null;

  // ✅ ADD THESE LINES HERE
const email = user?.Email || "-";
const contactNumber = user?.ContactNumber || "-";
const transactionId = appt?.TransactionID || "-";
const profilePath = user?.ProfileImagePath || "";
console.log("Patient:", patientName, "path:", profilePath);

  return {
    BillingID: row.BillingID,
    AppointmentID: row.AppointmentID,

    // existing
    patient: patientName,
    service,
    status,
    dateValue: dv,
    dateText: formatDateTime(row.DateIssued),
    apptWhen,
    paymentType: (row.PaymentType || '').toUpperCase() || '-',
    amount: Number(row.Amount || 0),
    method: row.PaymentMethod,
    extraCount,
    extraServiceNames,

    // ✅ ADD THESE FIELDS (used by tooltip)
  patientEmail: email,
  patientContact: contactNumber,
  transactionId: transactionId,
  patientProfilePath: profilePath,
  patientId: user?.UserAccountID || row.UserAccountID || ""
  
  };
});


        // Search: patient or service
        if (term) {
            rows = rows.filter(r => r.patient.toLowerCase().includes(term) || r.service.toLowerCase().includes(term));
        }

        // Status filter (issued only)
        if (filterStatus !== 'all') {
            rows = rows.filter(r => r.status === filterStatus);
        }

        // Date filter based on DateIssued
        rows = rows.filter(r => {
            if (!r.dateValue) return true;
            if (filterDateFrom && r.dateValue < filterDateFrom.getTime()) return false;
            if (filterDateTo && r.dateValue > filterDateTo.getTime()) return false;
            return true;
        });

        renderSummaryStats(calculateSummaryForIssued(issuedBills), "issued");

        if (rows.length === 0) {
            tableBody.innerHTML =
                '<tr><td colspan="7" class="text-center text-gray-500 py-8">No issued bills found.</td></tr>';
            return;
        }

tableBody.innerHTML = rows.map(r => {
const actionsRow =
  '<div class="mt-2 flex items-center gap-2">' +
    (r.status === "paid"
      ? '<button class="text-xs px-3 py-1 rounded-lg border text-gray-700 hover:bg-gray-50" ' +
        'onclick="printReceipt(\'' + r.BillingID + '\')">' +
        'Print Receipt</button>'
      : ''
    ) +
    '<button class="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary-dark" ' +
    'onclick="openApptModal(\'' + r.BillingID + '\')">' +
    'View Appointment</button>' +
  '</div>';
  return `
    <tr class="border-b hover:bg-gray-50 transition-colors">
      <td class="py-3 px-4">
${renderPatientCell({
  name: r.patient,
  email: r.patientEmail,
  contact: r.patientContact,
  transactionId: r.transactionId,
  profilePath: r.patientProfilePath,
  patientId: r.patientId
})}
</td>

      <td class="py-3 px-4">
        <div class="relative group inline-block">
          ${getTypeBadge(r.paymentType)}

          <div class="text-[11px] text-gray-600 leading-tight mt-0.5">
            ${r.service} • ${(r.apptWhen ? String(r.apptWhen).split(',')[0] : '-')}
          </div>

          <div
            class="absolute left-full top-1/2 ml-3 -translate-y-1/2
                   hidden group-hover:block
                   w-64 bg-gray-900 text-white text-xs
                   rounded-lg p-3 shadow-xl z-50"
          >
            <div class="mb-2">
              <span class="text-gray-400">Service</span><br>
              <span class="font-semibold">${r.service}</span>
            </div>

          ${r.extraServiceNames?.length ? `
            <div class="mb-2">
              <span class="text-gray-400">Additional Services</span><br>
              <span class="font-semibold">
                ${r.extraServiceNames.map(n => escapeHtml(n)).join("<br>")}
              </span>
            </div>
          ` : ""}

            <div>
              <span class="text-gray-400">Schedule</span><br>
              ${r.apptWhen}
            </div>
          </div>

          ${actionsRow}
        </div>
      </td>

      <td class="py-3 px-4 font-semibold text-gray-800">${formatCurrency(r.amount)}</td>
      <td class="py-3 px-4 text-sm text-gray-600">${r.dateText}</td>
      <td class="py-3 px-4">${getMethodBadge(r.method)}</td>
      <td class="py-3 px-4">${getStatusBadge(r.status)}</td>
    </tr>
  `;
}).join("");


        if (typeof lucide !== 'undefined') lucide.createIcons();
        console.log("SCRIPT REACHED HERE");
    }

function openBracesDownpaymentModal(planId) {
  const plan = bracesPlans.find(p => p.TreatmentPlanID === planId);
  if (!plan) return;

  const patientName =
    `${plan.UserAccount?.FirstName || ""} ${plan.UserAccount?.LastName || ""}`.trim() || "Unknown";

  const amount = Number(plan.DownpaymentAmount || 15000);

  // Reuse modal by passing an "appt-like" object
  openIssueModal({
    mode: "braces",
    appt: {
      AppointmentID: plan.SourceAppointmentID, // required to avoid Billing 400
      UserAccountID: plan.UserAccountID,
      Service: "Braces Downpayment (Treatment Plan)",
      AppointmentSchedule: plan.CreatedAt
    },
    plan,
    patientName,
    total: amount
  });
}


    function getTypeBadge(type) {
  const t = String(type || '').toUpperCase();

if (t === 'APPOINTMENT_FEE') {
  return `<span class="text-[11px] px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
    APPOINTMENT FEE
  </span>`;
}
  if (t === 'BILL') {
    return `<span class="text-[11px] px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-semibold">BILL</span>`;
  }
  return `<span class="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">${t || '-'}</span>`;
}

    // --- INITIALIZATION ---
    window.onload = async function() {
        const user = await checkAuth(true);
        if (!user) return;

        await loadNotifications();
        await refreshAll();
        setTab('toIssue');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    };

      (function setActiveNav() {
    const path = (location.pathname.split("/").pop() || "").toLowerCase(); // e.g. "profile.html"
    document.querySelectorAll("aside nav a[href]").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isActive = href === path;

      a.classList.toggle("bg-white/10", isActive);
    });
  })();