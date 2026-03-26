// ========== SUPABASE CONFIG ==========
const SUPABASE_URL = "https://bqvpwzaekjtuctylzjoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_mcRzWAYgimSGoHHzcaDYEg_Oxsj0Zdv";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== GLOBAL VARIABLES ==========
let rows = [];
let editId = null;
let sortCol = "date";
let sortDir = "asc";
let charts = {};
let weeklyChart = null;

let currentPhotoRowId = null;

const SYSICO = {
  HVAC: "wind",
  Electrical: "lightning-charge-fill",
  Fire: "fire",
  BMS: "cpu-fill",
  Civil: "building",
  Mechanical: "wrench-adjustable-fill"
};

// ========== HELPER FUNCTIONS ==========
function markSaved(msg = "Saved just now") {
  const el = document.getElementById("lastSaved");
  if (el) el.innerHTML = `<i class="bi bi-cloud-check-fill"></i> ${msg}`;
}

function autoSt(planned, actual) {
  const p = Number(planned) || 0;
  const a = Number(actual) || 0;
  const d = p - a;
  if (a === 0 && p === 0) return "Not Started";
  if (a >= 100) return "Completed";
  if (d > 5) return "Delayed";
  if (a > 0 && a < p) return "In Progress";
  return "On Track";
}

// Extract the first number from a string (supports decimals)
function extractNumber(str) {
  const match = String(str).match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function calcProgress(requiredStr, installedStr) {
  const required = extractNumber(requiredStr);
  const installed = extractNumber(installedStr);
  if (required === 0) return 0;
  return Math.min(100, ((installed / required) * 100).toFixed(1));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(str) {
  return String(str ?? "").replaceAll('"', "&quot;");
}

function toast(msg, icon = "bi-info-circle", type = "info") {
  const dock = document.getElementById("toastDock");
  if (!dock) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="t-ico"><i class="bi ${icon}"></i></div><span class="t-msg">${escapeHtml(msg)}</span>`;
  dock.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

// ========== DATA LOADING ==========
async function load() {
  try {
    const { data, error } = await supabaseClient
      .from("dpr")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    rows = (data || []).map((r) => {
      // required and installed are now stored as strings (e.g., "150 sqm")
      const requiredStr = String(r.required || "0");
      const installedStr = String(r.installed || "0");
      const actual = calcProgress(requiredStr, installedStr);
      const status = autoSt(100, actual);
      return {
        id: r.id,
        date: r.date || "",
        system: r.system || "HVAC",
        activity: r.activity || "",
        required: requiredStr,
        installed: installedStr,
        planned: 100,
        actual: actual,
        status: status,
        remarks: r.remarks || "",
        photos: r.photos || []
      };
    });

    render();
    updateSummary();
    markSaved("Synced from database");

    if (document.getElementById("view-charts")?.classList.contains("active")) {
      renderCharts();
    }
  } catch (err) {
    console.error("Load error:", err);
    toast("Failed to load data from Supabase", "bi-exclamation-triangle-fill", "error");
  }
}

// ========== FILTERING & SORTING ==========
function getFiltered() {
  const q = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const sys = document.getElementById("sysFilter")?.value || "";
  const st = document.getElementById("statusFilter")?.value || "";

  return rows.filter(
    (r) =>
      (!q ||
        r.activity.toLowerCase().includes(q) ||
        r.system.toLowerCase().includes(q) ||
        (r.remarks || "").toLowerCase().includes(q)) &&
      (!sys || r.system === sys) &&
      (!st || r.status === st)
  );
}

function getSorted(arr) {
  return [...arr].sort((a, b) => {
    let va, vb;
    if (sortCol === "delay") {
      va = 100 - a.actual;
      vb = 100 - b.actual;
    } else if (sortCol === "required" || sortCol === "installed") {
      // Sort by the numeric part for quantities
      va = extractNumber(a[sortCol]);
      vb = extractNumber(b[sortCol]);
    } else if (sortCol === "actual") {
      va = Number(a.actual) || 0;
      vb = Number(b.actual) || 0;
    } else if (sortCol === "id") {
      va = Number(a.id) || 0;
      vb = Number(b.id) || 0;
    } else {
      va = String(a[sortCol] ?? "").toLowerCase();
      vb = String(b[sortCol] ?? "").toLowerCase();
    }

    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function sortT(col) {
  sortDir = sortCol === col ? (sortDir === "asc" ? "desc" : "asc") : "asc";
  sortCol = col;

  document.querySelectorAll("thead th").forEach((t) => t.classList.remove("asc", "desc"));
  const map = { date: 1, system: 2, activity: 3, required: 4, installed: 5, actual: 6, delay: 7, status: 8 };
  const th = document.querySelectorAll("thead th")[map[col]];
  if (th) th.classList.add(sortDir === "asc" ? "asc" : "desc");

  render();
}

function applyFilters() {
  render();
}

// ========== RENDER TABLE ==========
function render() {
  const tbody = document.getElementById("tBody");
  if (!tbody) return;

  const filtered = getSorted(getFiltered());

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty">
            <div class="empty-ico"><i class="bi bi-inbox"></i></div>
            <p>No activities found</p>
            <span>Adjust search/filters or add a new activity.</span>
          </div>
        </td>
      </tr>
    `;
    document.getElementById("rowCount").textContent = "0 rows";
    updateCards();
    updateSbStats();
    updDelBtn();
    return;
  }

  tbody.innerHTML = filtered.map(rowHTML).join("");
  document.getElementById("rowCount").textContent = `${filtered.length} of ${rows.length} rows`;
  updateCards();
  updateSbStats();
  updDelBtn();
}

function rowHTML(r) {
  const d = 100 - Number(r.actual);
  const rc = d > 5 ? "row-red" : d <= 0 && r.actual > 0 ? "row-grn" : "";
  const ico = SYSICO[r.system] || "gear";
  const ap = Math.min(100, Math.max(0, Number(r.actual) || 0));

  const dc =
    d === 0
      ? `<span class="delay-chip dc-zero"><i class="bi bi-dash"></i>0%</span>`
      : d > 0
      ? `<span class="delay-chip dc-pos"><i class="bi bi-arrow-up-short"></i>+${d.toFixed(1)}%</span>`
      : `<span class="delay-chip dc-neg"><i class="bi bi-arrow-down-short"></i>${d.toFixed(1)}%</span>`;

  const photoCount = r.photos && r.photos.length ? r.photos.length : 0;
  const photoBadge = photoCount ? `<span class="photo-count">${photoCount}</span>` : '';

  return `
    <tr class="${rc}" data-id="${r.id}">
      <td class="sel-col"><input type="checkbox" class="rck" onchange="updDelBtn()"></td>
      <td><span class="td-date" contenteditable="true" onblur="cEdit(this,'${r.id}','date')">${escapeHtml(r.date)}</span></td>
      <td><span class="sys-p sys-${escapeAttr(r.system)}"><i class="bi bi-${ico}"></i>${escapeHtml(r.system)}</span></td>
      <td style="max-width:210px;font-weight:500" contenteditable="true" onblur="cEdit(this,'${r.id}','activity')">${escapeHtml(r.activity)}</td>
      <td contenteditable="true" onblur="cEdit(this,'${r.id}','required')">${escapeHtml(r.required || "0")}</td>
      <td contenteditable="true" onblur="cEdit(this,'${r.id}','installed')">${escapeHtml(r.installed || "0")}</td>
      <td>
        <div class="prog">
          <div class="prog-bar"><div class="prog-fill pf-ok" style="width:${ap}%"></div></div>
          <span class="prog-n">${Number(r.actual) || 0}</span>
        </div>
      </td>
      <td>${dc}</td>
      <td>${sBadge(r.status)}</td>
      <td class="td-rem" contenteditable="true" onblur="cEdit(this,'${r.id}','remarks')">${escapeHtml(r.remarks || "")}</td>
      <td class="photos-cell">
        <button class="abt" onclick="openPhotoManager('${r.id}')" title="Manage photos">
          <i class="bi bi-camera"></i>
        </button>
        ${photoBadge}
      </td>
      <td class="td-act">
        <button class="abt" title="Edit" onclick="openEdit('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
        <button class="abt del" title="Delete" onclick="delRow('${r.id}')"><i class="bi bi-trash3-fill"></i></button>
      </td>
    </tr>
  `;
}

function sBadge(s) {
  const m = {
    "On Track": ["s-ok", "check2-circle"],
    Completed: ["s-done", "patch-check-fill"],
    Delayed: ["s-dl", "exclamation-triangle-fill"],
    "In Progress": ["s-ip", "arrow-repeat"],
    "Not Started": ["s-ns", "dash-circle"]
  };
  const c = m[s] || m["Not Started"];
  return `<span class="sbadge ${c[0]}"><i class="bi bi-${c[1]}"></i>${escapeHtml(s)}</span>`;
}

function updateCards() {
  const t = rows.length;
  const ok = rows.filter(r => r.status === "Completed" || r.actual >= 100).length;
  const dl = rows.filter(r => (100 - r.actual) > 5).length;
  const avg = t ? (rows.reduce((s, r) => s + (Number(r.actual) || 0), 0) / t).toFixed(1) : 0;

  document.getElementById("card-total").textContent = t;
  document.getElementById("card-done").textContent = ok;
  document.getElementById("card-delayed").textContent = dl;
  document.getElementById("card-progress").textContent = avg + "%";
  document.getElementById("nb-total").textContent = t;
  document.getElementById("nb-delayed").textContent = dl;

  const cb = document.getElementById("cb-tot");
  if (cb) cb.textContent = t + " items";
}

function updateSbStats() {
  const sys = ["HVAC", "Electrical", "Fire", "BMS", "Civil", "Mechanical"];
  const html = sys
    .map((s) => {
      const c = rows.filter((r) => r.system === s).length;
      if (!c) return "";
      return `
        <div class="sb-stat">
          <span class="sys"><i class="bi bi-${SYSICO[s] || "gear"}"></i>${s}</span>
          <span class="cnt">${c}</span>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  document.getElementById("sbStats").innerHTML =
    html || '<div style="color:var(--text3);font-size:12px">No data</div>';
}

// ========== INLINE EDIT ==========
async function cEdit(el, id, field) {
  const r = rows.find((x) => String(x.id) === String(id));
  if (!r) return;

  try {
    let v = el.textContent.trim();
    const updateObj = {};

    // For required/installed, we store the string as-is (including unit)
    // For other fields, just store the value
    updateObj[field] = v;

    // If required or installed changed, recalculate actual and status
    if (field === "required" || field === "installed") {
      const newRequired = field === "required" ? v : r.required;
      const newInstalled = field === "installed" ? v : r.installed;
      const newActual = calcProgress(newRequired, newInstalled);
      updateObj.actual = newActual;
      updateObj.status = autoSt(100, newActual);
    }

    const { error } = await supabaseClient.from("dpr").update(updateObj).eq("id", id);
    if (error) throw error;

    markSaved(`Saved ${new Date().toLocaleTimeString()}`);
    await load();
  } catch (err) {
    console.error("Update error:", err);
    toast("Failed to update row", "bi-exclamation-triangle-fill", "error");
    await load();
  }
}

// ========== SELECTION & BATCH DELETE ==========
function toggleSelAll(cb) {
  document.querySelectorAll(".rck").forEach((c) => {
    c.checked = cb.checked;
  });
  updDelBtn();
}

function updDelBtn() {
  const btn = document.getElementById("deleteSelBtn");
  if (!btn) return;
  btn.style.display = document.querySelectorAll(".rck:checked").length > 0 ? "" : "none";
}

async function deleteSelected() {
  const trs = [...document.querySelectorAll("tbody tr")].filter((t) => t.querySelector(".rck:checked"));
  if (!trs.length) return;
  if (!confirm(`Delete ${trs.length} row(s)?`)) return;

  try {
    const ids = trs.map((t) => Number(t.dataset.id)).filter(Boolean);
    const { error } = await supabaseClient.from("dpr").delete().in("id", ids);
    if (error) throw error;

    toast("Rows deleted", "bi-trash3-fill", "error");
    await load();
  } catch (err) {
    console.error("Delete selected error:", err);
    toast("Failed to delete selected rows", "bi-exclamation-triangle-fill", "error");
  }
}

async function delRow(id) {
  if (!confirm("Delete this row?")) return;

  try {
    const { error } = await supabaseClient.from("dpr").delete().eq("id", id);
    if (error) throw error;

    toast("Row deleted", "bi-trash3-fill", "error");
    await load();
  } catch (err) {
    console.error("Delete row error:", err);
    toast("Failed to delete row", "bi-exclamation-triangle-fill", "error");
  }
}

// ========== ADD/EDIT MODAL ==========
function openModal() {
  editId = null;
  document.getElementById("mTitle").textContent = "Add Activity";
  document.getElementById("mIco").innerHTML = '<i class="bi bi-plus-circle-fill"></i>';
  document.getElementById("m-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("m-activity").value = "";
  document.getElementById("m-required").value = "";
  document.getElementById("m-installed").value = "";
  document.getElementById("m-remarks").value = "";
  document.getElementById("m-system").selectedIndex = 0;
  document.getElementById("ov").classList.add("open");
  setTimeout(() => document.getElementById("m-activity").focus(), 220);
}

function openEdit(id) {
  const r = rows.find((x) => String(x.id) === String(id));
  if (!r) return;

  editId = id;
  document.getElementById("mTitle").textContent = "Edit Activity";
  document.getElementById("mIco").innerHTML = '<i class="bi bi-pencil-fill"></i>';
  document.getElementById("m-date").value = r.date;
  document.getElementById("m-system").value = r.system;
  document.getElementById("m-activity").value = r.activity;
  document.getElementById("m-required").value = r.required;
  document.getElementById("m-installed").value = r.installed;
  document.getElementById("m-remarks").value = r.remarks || "";
  document.getElementById("ov").classList.add("open");
}

function closeModal() {
  document.getElementById("ov").classList.remove("open");
}

async function saveRow() {
  const date = document.getElementById("m-date").value;
  const system = document.getElementById("m-system").value;
  const activity = document.getElementById("m-activity").value.trim();
  const required = document.getElementById("m-required").value.trim();
  const installed = document.getElementById("m-installed").value.trim();
  const remarks = document.getElementById("m-remarks").value.trim();

  if (!date || !activity) {
    toast("Date and Activity are required", "bi-exclamation-circle", "error");
    return;
  }

  const actual = calcProgress(required, installed);
  const planned = 100;
  const status = autoSt(planned, actual);

  try {
    if (editId) {
      const { error } = await supabaseClient
        .from("dpr")
        .update({ date, system, activity, required, installed, planned, actual, status, remarks })
        .eq("id", editId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from("dpr")
        .insert([{ date, system, activity, required, installed, planned, actual, status, remarks }]);
      if (error) throw error;
    }

    closeModal();
    toast(editId ? "Activity updated" : "Activity added", "bi-check-circle-fill", "success");
    await load();
  } catch (err) {
    console.error("Save row error:", err);
    toast("Failed to save activity", "bi-exclamation-triangle-fill", "error");
  }
}

document.getElementById("ov")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ========== EXPORT EXCEL ==========
function exportExcel() {
  if (!rows.length) {
    toast("No data to export", "bi-info-circle", "info");
    return;
  }

  const data = [
    ["Date", "System", "Activity", "Required", "Installed", "Actual %", "Delay %", "Status", "Remarks", "Photos"],
    ...rows.map((r) => [
      r.date,
      r.system,
      r.activity,
      r.required,
      r.installed,
      r.actual,
      (100 - Number(r.actual)).toFixed(1),
      r.status,
      r.remarks || "",
      (r.photos || []).join(", ")
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 15 },
    { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily Progress Report");
  XLSX.writeFile(wb, `DPR_${new Date().toISOString().split("T")[0]}.xlsx`);
  toast("Excel exported!", "bi-file-earmark-check-fill", "success");
}

// ========== SUMMARY DASHBOARD FUNCTIONS ==========
function getISOWeekNumber(dateStr) {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function getDateFromISOWeek(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const isoWeekStart = new Date(simple);
  if (dow <= 4) isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return isoWeekStart;
}

function getSummaryMetrics() {
  const completed = rows.filter(r => r.status === "Completed" || Number(r.actual) === 100).length;
  const pending = rows.filter(r => r.status !== "Completed" && Number(r.actual) < 100).length;
  const delayed = rows.filter(r => (100 - Number(r.actual)) > 5).length;
  return { completed, pending, delayed };
}

function getWeeklyData(weeksLimit = 6) {
  const weeksMap = new Map();

  rows.forEach(r => {
    if (!r.date) return;
    const weekKey = getISOWeekNumber(r.date);
    const actual = Number(r.actual) || 0;
    if (!weeksMap.has(weekKey)) {
      weeksMap.set(weekKey, { actualSum: 0, count: 0 });
    }
    const w = weeksMap.get(weekKey);
    w.actualSum += actual;
    w.count++;
  });

  const weeksArray = Array.from(weeksMap.entries())
    .map(([week, data]) => ({
      week,
      actualAvg: data.count ? data.actualSum / data.count : 0
    }))
    .sort((a, b) => a.week.localeCompare(b.week));

  const lastWeeks = weeksArray.slice(-weeksLimit);

  const labels = lastWeeks.map(w => {
    const [year, weekNum] = w.week.split('-W');
    const start = getDateFromISOWeek(parseInt(year), parseInt(weekNum));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${startStr}–${endStr}`;
  });

  const actualAvg = lastWeeks.map(w => w.actualAvg.toFixed(1));

  return { labels, actualAvg };
}

function renderWeeklyChart() {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  const { labels, actualAvg } = getWeeklyData(6);
  if (labels.length === 0) {
    if (weeklyChart) weeklyChart.destroy();
    weeklyChart = null;
    ctx.style.display = 'none';
    return;
  }
  ctx.style.display = 'block';

  const isDark = document.documentElement.dataset.theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const textColor = isDark ? '#8b91b8' : '#5a5f7a';

  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Actual Progress %',
          data: actualAvg,
          borderColor: '#4f46e5',
          backgroundColor: 'transparent',
          tension: 0.3,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: gridColor },
          title: { display: true, text: 'Progress %', color: textColor }
        },
        x: {
          grid: { display: false },
          title: { display: true, text: 'Week', color: textColor }
        }
      },
      plugins: {
        tooltip: { mode: 'index', intersect: false },
        legend: {
          position: 'top',
          labels: { color: textColor, usePointStyle: true }
        }
      }
    }
  });
}

function updateSummary() {
  const { completed, pending, delayed } = getSummaryMetrics();
  document.getElementById('summaryCompleted').textContent = completed;
  document.getElementById('summaryPending').textContent = pending;
  document.getElementById('summaryDelayed').textContent = delayed;

  const dashboardActive = document.getElementById('view-dashboard').classList.contains('active');
  if (dashboardActive) {
    renderWeeklyChart();
  }
}

// ========== PHOTO MANAGEMENT ==========
function openPhotoManager(id) {
  const row = rows.find(r => String(r.id) === String(id));
  if (!row) return;
  currentPhotoRowId = id;
  document.getElementById('photoModalTitle').innerHTML = `<i class="bi bi-camera-fill"></i> Photos – ${escapeHtml(row.activity)}`;
  renderPhotoGrid(row.photos || []);
  document.getElementById('photoOv').classList.add('open');
}

function closePhotoModal() {
  document.getElementById('photoOv').classList.remove('open');
  currentPhotoRowId = null;
}

function renderPhotoGrid(photos) {
  const grid = document.getElementById('photoGrid');
  if (!photos.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:20px;">No photos yet</div>';
    return;
  }
  grid.innerHTML = photos.map(url => `
    <div class="photo-item">
      <img src="${url}" class="photo-thumb" onclick="window.open('${url}','_blank')">
      <button class="photo-delete" onclick="deletePhoto('${currentPhotoRowId}', '${url}')"><i class="bi bi-x"></i></button>
    </div>
  `).join('');
}

document.getElementById('photoUploadInput')?.addEventListener('change', async function(e) {
  const files = e.target.files;
  if (!files.length || !currentPhotoRowId) return;

  toast('Uploading...', 'bi-cloud-upload', 'info');

  const uploadPromises = [];
  for (let file of files) {
    const ext = file.name.split('.').pop();
    const fileName = `${currentPhotoRowId}_${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
    const filePath = `public/${fileName}`;

    const promise = supabaseClient.storage
      .from('dpr-photos')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })
      .then(({ data, error }) => {
        if (error) throw error;
        const { data: { publicUrl } } = supabaseClient.storage
          .from('dpr-photos')
          .getPublicUrl(filePath);
        return publicUrl;
      });
    uploadPromises.push(promise);
  }

  try {
    const urls = await Promise.all(uploadPromises);

    const row = rows.find(r => String(r.id) === String(currentPhotoRowId));
    const updatedPhotos = [...(row.photos || []), ...urls];

    const { error } = await supabaseClient
      .from('dpr')
      .update({ photos: updatedPhotos })
      .eq('id', currentPhotoRowId);

    if (error) throw error;

    row.photos = updatedPhotos;
    renderPhotoGrid(updatedPhotos);

    const cell = document.querySelector(`tr[data-id="${currentPhotoRowId}"] .photos-cell`);
    if (cell) {
      const countSpan = cell.querySelector('.photo-count');
      if (updatedPhotos.length) {
        if (countSpan) {
          countSpan.textContent = updatedPhotos.length;
        } else {
          cell.innerHTML += `<span class="photo-count">${updatedPhotos.length}</span>`;
        }
      } else if (countSpan) {
        countSpan.remove();
      }
    }

    toast('Photos uploaded successfully!', 'bi-check-circle-fill', 'success');
  } catch (err) {
    console.error('Upload error:', err);
    toast('Failed to upload photos', 'bi-exclamation-triangle-fill', 'error');
  } finally {
    document.getElementById('photoUploadInput').value = '';
  }
});

async function deletePhoto(rowId, url) {
  if (!confirm('Remove this photo?')) return;
  try {
    const row = rows.find(r => String(r.id) === String(rowId));
    const updatedPhotos = (row.photos || []).filter(u => u !== url);

    const { error } = await supabaseClient
      .from('dpr')
      .update({ photos: updatedPhotos })
      .eq('id', rowId);

    if (error) throw error;

    row.photos = updatedPhotos;

    if (currentPhotoRowId === rowId) {
      renderPhotoGrid(updatedPhotos);
    }

    const cell = document.querySelector(`tr[data-id="${rowId}"] .photos-cell`);
    if (cell) {
      const countSpan = cell.querySelector('.photo-count');
      if (updatedPhotos.length) {
        if (countSpan) countSpan.textContent = updatedPhotos.length;
      } else if (countSpan) {
        countSpan.remove();
      }
    }

    toast('Photo deleted', 'bi-trash3-fill', 'info');
  } catch (err) {
    console.error('Delete error:', err);
    toast('Failed to delete photo', 'bi-exclamation-triangle-fill', 'error');
  }
}

document.getElementById('photoOv')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePhotoModal();
});

// ========== CHARTS ==========
function renderCharts() {
  const dark = document.documentElement.dataset.theme === "dark";
  const grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  const tc = dark ? "#4e5478" : "#9198b8";
  const font = { family: "Plus Jakarta Sans", size: 12 };

  Chart.defaults.color = tc;
  Chart.defaults.font = font;

  Object.values(charts).forEach((c) => c.destroy());
  charts = {};

  const sts = ["On Track", "Completed", "In Progress", "Delayed", "Not Started"];
  const stC = sts.map((s) => rows.filter((r) => r.status === s).length);

  charts.status = new Chart("statusChart", {
    type: "doughnut",
    data: {
      labels: sts,
      datasets: [
        {
          data: stC,
          backgroundColor: ["#059669", "#4f46e5", "#d97706", "#dc2626", "#64748b"],
          borderWidth: 0,
          hoverOffset: 8,
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 16, font, usePointStyle: true, pointStyleWidth: 8 }
        }
      }
    }
  });

  const sys = ["HVAC", "Electrical", "Fire", "BMS", "Civil", "Mechanical"];
  const ac = sys.map((s) => {
    const rs = rows.filter((r) => r.system === s);
    return rs.length ? +(rs.reduce((a, r) => a + (Number(r.actual) || 0), 0) / rs.length).toFixed(1) : 0;
  });

  charts.system = new Chart("systemChart", {
    type: "bar",
    data: {
      labels: sys,
      datasets: [
        {
          label: "Actual %",
          data: ac,
          backgroundColor: "rgba(79,70,229,.75)",
          borderRadius: 5,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { grid: { color: grid } },
        y: { grid: { color: grid }, max: 100, ticks: { stepSize: 25 } }
      },
      plugins: {
        legend: { labels: { font, usePointStyle: true, pointStyleWidth: 8 } }
      }
    }
  });

  const topRows = rows.slice(0, 10);
  const lbs = topRows.map((r) => r.activity.slice(0, 24) + (r.activity.length > 24 ? "…" : ""));
  const cv = document.getElementById("barChart");
  if (cv) cv.height = Math.max(180, topRows.length * 40);

  charts.bar = new Chart("barChart", {
    type: "bar",
    data: {
      labels: lbs,
      datasets: [
        {
          label: "Actual %",
          data: topRows.map((r) => Number(r.actual) || 0),
          backgroundColor: "rgba(79,70,229,.75)",
          borderRadius: 4,
          borderSkipped: false
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      scales: {
        x: { grid: { color: grid }, max: 100 },
        y: { grid: { display: false } }
      },
      plugins: {
        legend: { labels: { font, usePointStyle: true, pointStyleWidth: 8 } }
      }
    }
  });

  const dd = rows.map((r) => ({
    x: Number(r.actual) || 0,
    y: +(100 - Number(r.actual)).toFixed(1)
  }));

  charts.delay = new Chart("delayChart", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Delay",
          data: dd,
          backgroundColor: dd.map((d) =>
            d.y > 5 ? "rgba(220,38,38,.7)" : d.y <= 0 ? "rgba(5,150,105,.7)" : "rgba(217,119,6,.7)"
          ),
          pointRadius: 8,
          pointHoverRadius: 11
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: "Actual %", font }, grid: { color: grid } },
        y: { title: { display: true, text: "Delay %", font }, grid: { color: grid } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ========== THEME & SIDEBAR ==========
function toggleTheme() {
  const d = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = d ? "light" : "dark";
  document.getElementById("themeBtn").innerHTML = d
    ? '<i class="bi bi-moon-stars-fill"></i>'
    : '<i class="bi bi-sun-fill"></i>';

  if (document.getElementById("view-charts").classList.contains("active")) renderCharts();
  if (document.getElementById("view-dashboard").classList.contains("active") && weeklyChart) {
    renderWeeklyChart();
  }
}

function toggleSb() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sbOv").classList.toggle("open");
}

function switchView(name, btn) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  if (name === "charts") setTimeout(renderCharts, 60);
  if (window.innerWidth < 768) toggleSb();
}

// ========== CLOCK ==========
function updateClock() {
  document.getElementById("liveClock").textContent = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
setInterval(updateClock, 1000);
updateClock();

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  await load();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    openModal();
  }
  if (e.ctrlKey && e.key === "e") {
    e.preventDefault();
    exportExcel();
  }
});