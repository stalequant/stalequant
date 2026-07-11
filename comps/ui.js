/* =========================
   UI wiring
========================= */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const ch of children) {
    if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
    else if (ch) node.appendChild(ch);
  }
  return node;
}

function renderTokenList(listEl, setRef) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const syms = [...setRef].sort((a, b) => a.localeCompare(b));
  for (const sym of syms) {
    const token = el("li", { class: "comps-token", draggable: "true" }, [
      el("span", { class: "tSym", text: sym }),
      el("button", {
        class: "x", type: "button", title: "Remove", onclick: (e) => {
          e.stopPropagation();
          setRef.delete(sym);
          renderAll();
          scheduleReplot();
        }
      }, ["x"])
    ]);
    token.addEventListener("dragstart", (ev) => {
      token.classList.add("dragging");
      ev.dataTransfer.setData("text/plain", sym);
      ev.dataTransfer.effectAllowed = "move";
    });
    token.addEventListener("dragend", () => token.classList.remove("dragging"));
    listEl.appendChild(token);
  }
}

function attachDropZone(listEl, getSet) {
  if (!listEl) return;
  listEl.addEventListener("dragover", (ev) => { ev.preventDefault(); listEl.classList.add("dragOver"); ev.dataTransfer.dropEffect = "move"; });
  listEl.addEventListener("dragleave", () => listEl.classList.remove("dragOver"));
  listEl.addEventListener("drop", (ev) => {
    ev.preventDefault(); listEl.classList.remove("dragOver");
    const sym = uniqUpper(ev.dataTransfer.getData("text/plain"));
    if (!sym) return;
    state.targets.delete(sym); state.benchmarks.delete(sym);
    getSet().add(sym);
    renderAll(); scheduleReplot();
  });
}

function filterSuggestions(q, excludedSet) {
  const qq = uniqUpper(q);
  if (!qq || !UNIVERSE.loaded) return [];
  const out = [];
  for (const base of UNIVERSE.baseAssets) {
    if (excludedSet.has(base)) continue;
    if (base.startsWith(qq) || base.includes(qq)) {
      out.push(base);
      if (out.length >= 20) break;
    }
  }
  return out;
}

function setupPicker(inputEl, dropdownEl, setRefGetter) {
  if (!inputEl || !dropdownEl) return;
  function close() { dropdownEl.style.display = "none"; dropdownEl.innerHTML = ""; }
  function open(items) {
    dropdownEl.innerHTML = "";
    for (const base of items) {
      const perp = UNIVERSE.baseToUSDTPerp.get(base) || (base + "USDT");
      const item = el("div", { class: "comps-ddItem", role: "button", tabindex: "0" }, [
        el("div", { class: "sym", text: base }),
        el("div", { class: "meta", text: perp })
      ]);
      item.addEventListener("click", () => {
        setRefGetter().add(base);
        inputEl.value = "";
        close();
        renderAll();
        scheduleReplot();
      });
      item.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.click(); } });
      dropdownEl.appendChild(item);
    }
    dropdownEl.style.display = items.length ? "block" : "none";
  }

  inputEl.addEventListener("input", () => open(filterSuggestions(inputEl.value, setRefGetter())));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const sym = uniqUpper(inputEl.value);
      if (!sym) return;
      if (UNIVERSE.loaded) {
        if (UNIVERSE.baseAssets.includes(sym)) setRefGetter().add(sym);
        else if (sym.endsWith("USDT") && UNIVERSE.symbolInfo.has(sym)) setRefGetter().add(UNIVERSE.symbolInfo.get(sym).baseAsset);
        else setRefGetter().add(sym.replace(/USDT$/, ""));
      } else {
        setRefGetter().add(sym.replace(/USDT$/, ""));
      }
      inputEl.value = "";
      close();
      renderAll();
      scheduleReplot();
    } else if (e.key === "Escape") { close(); }
  });
  document.addEventListener("click", (e) => { if (!dropdownEl.contains(e.target) && e.target !== inputEl) close(); });
}

function setupOptionGroups() {
  document.querySelectorAll(".comps-optBtns[data-group]").forEach((grp) => {
    const name = grp.getAttribute("data-group");
    const btns = [...grp.querySelectorAll("button")];
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.options[name] = btn.getAttribute("data-value");
        scheduleReplot();
      });
    });
  });
}

function renderAll() {
  renderTokenList($("listTarget"), state.targets);
  renderTokenList($("listBench"), state.benchmarks);
  const cacheBadge = $("compsCacheBadge");
  if (cacheBadge) cacheBadge.textContent = store.candleCache.size + " keys";
}

let replotTimer = null;
function scheduleReplot() {
  clearTimeout(replotTimer);
  replotTimer = setTimeout(() => updatePlot().catch(e => {
    showToast("Unexpected error", String(e && e.message ? e.message : e));
  }), 250);
}

