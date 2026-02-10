// /assets/js/ui-feedback.js
(function () {
  // ---- Inject UI (once) ----
  function ensureUI() {
    if (!document.getElementById("thGlobalLoading")) {
      const el = document.createElement("div");
      el.innerHTML = `
        <div id="thGlobalLoading" class="fixed inset-0 hidden items-center justify-center bg-black/40 z-[20000] px-4">
          <div class="bg-white w-full max-w-sm rounded-2xl shadow-xl border p-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              <div>
                <div id="thLoadingTitle" class="font-bold text-gray-900">Processing…</div>
                <div id="thLoadingText" class="text-sm text-gray-600">Please wait.</div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }

    if (!document.getElementById("thGlobalModal")) {
      const el = document.createElement("div");
      el.innerHTML = `
        <div id="thGlobalModal" class="fixed inset-0 hidden items-center justify-center bg-black/40 z-[20001] px-4">
          <div class="bg-white w-full max-w-sm rounded-2xl shadow-xl border overflow-hidden">
            <div class="px-5 py-4 border-b">
              <div id="thModalTitle" class="text-lg font-bold text-gray-900">Message</div>
            </div>
            <div class="px-5 py-4">
              <p id="thModalBody" class="text-sm text-gray-700"></p>
            </div>
            <div class="px-5 py-4 bg-gray-50 flex justify-end">
              <button
                id="thModalOk"
                class="px-4 py-2 rounded-lg bg-[#03555E] hover:bg-[#024449] text-white font-medium">
                OK
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(el);

      const modal = document.getElementById("thGlobalModal");
      const ok = document.getElementById("thModalOk");

      ok.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        const cb = modal._onOk;
        modal._onOk = null;
        if (typeof cb === "function") cb();
      });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) ok.click();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) ok.click();
      });
    }
  }

  // ---- Loading API ----
  function showLoading(text = "Please wait.", title = "Processing…") {
    ensureUI();
    const wrap = document.getElementById("thGlobalLoading");
    const t = document.getElementById("thLoadingTitle");
    const m = document.getElementById("thLoadingText");
    if (t) t.textContent = title;
    if (m) m.textContent = text;
    wrap.classList.remove("hidden");
    wrap.classList.add("flex");
  }

  function hideLoading() {
    const wrap = document.getElementById("thGlobalLoading");
    if (!wrap) return;
    wrap.classList.add("hidden");
    wrap.classList.remove("flex");
  }

  // ---- Message API (center modal + OK) ----
  function showMessage(text, type = "info", opts = {}) {
    ensureUI();
    const modal = document.getElementById("thGlobalModal");
    const titleEl = document.getElementById("thModalTitle");
    const bodyEl = document.getElementById("thModalBody");

    const title =
      opts.title ||
      (type === "success" ? "Success" :
       type === "error" ? "Error" :
       type === "warning" ? "Warning" : "Message");

    titleEl.textContent = title;
    bodyEl.textContent = text || "";
    modal._onOk = typeof opts.onOk === "function" ? opts.onOk : null;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  // ---- Helper wrapper: auto show/hide loading ----
  async function withLoading(fn, loadingText = "Please wait.", loadingTitle = "Processing…") {
    showLoading(loadingText, loadingTitle);
    try {
      return await fn();
    } finally {
      hideLoading();
    }
  }

  // ✅ Export globally (and override if a page already has showMessage)
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.showMessage = showMessage;
  window.withLoading = withLoading;
})();
