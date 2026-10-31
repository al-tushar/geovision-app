import { SUPABASE_CONFIG } from "./config.js";

const CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"];

const SEVERITY_META = {
  "no-damage": {
    label: "No Damage",
    headline: "No Visible Structural Damage",
    desc: "Roof geometry and property perimeter appear intact with no major debris or collapse signatures.",
  },
  "minor-damage": {
    label: "Minor Damage",
    headline: "Minor Roof or Perimeter Damage",
    desc: "Indicators suggest localized shingle wear, protective tarping, or light surrounding storm debris.",
  },
  "major-damage": {
    label: "Major Damage",
    headline: "Major Structural Damage",
    desc: "Substantial roof compromise, partial framing exposure, or heavy floodwater/fire impact detected.",
  },
  destroyed: {
    label: "Destroyed",
    headline: "Severe Collapse / Destroyed",
    desc: "Structure exhibits near-total loss, exposed concrete foundation slab, or dense rubble distribution.",
  },
};

const DISASTER_NAMES = {
  "hurricane-harvey": "Hurricane Harvey",
  "hurricane-matthew": "Hurricane Matthew",
  "hurricane-michael": "Hurricane Michael",
  "palu-tsunami": "Palu Tsunami",
  "santa-rosa-wildfire": "Santa Rosa Wildfire",
  "mexico-earthquake": "Mexico Earthquake",
  "socal-fire": "Southern California Fire",
  "hurricane-florence": "Hurricane Florence",
  "midwest-flooding": "Midwest Flooding",
  "guatemala-volcano": "Guatemala Volcano",
};

const SAMPLES = [
  {
    id: "intact",
    shortTitle: "Intact Home",
    tag: "Clear Roofline",
    sampleName: "Suburban Residence — Clear Roofline",
    notes: "Clean shingle roof surrounded by intact yard and driveway.",
    src: "./assets/crop-intact.jpg",
  },
  {
    id: "major",
    shortTitle: "Hurricane Roof",
    tag: "Flood & Collapse",
    sampleName: "Flooded Residence — Partial Roof Collapse",
    notes: "Collapsed roof section with exposed trusses and floodwater.",
    src: "./assets/crop-major.jpg",
  },
  {
    id: "destroyed",
    shortTitle: "Wildfire Slab",
    tag: "Rubble Footprint",
    sampleName: "Wildfire Footprint — Foundation Slab",
    notes: "Complete structural loss reduced to foundation slab and ash.",
    src: "./assets/crop-destroyed.jpg",
  },
  {
    id: "minor",
    shortTitle: "Storm Tarp",
    tag: "Shingle Wear",
    sampleName: "Post-Storm Roof — Protective Tarp",
    notes: "Minor shingle loss with blue emergency tarp on roof corner.",
    src: "./assets/crop-minor.jpg",
  },
];

// Offscreen clean 128x128 RGB tensor canvas
const tensorCanvas = document.createElement("canvas");
tensorCanvas.width = 128;
tensorCanvas.height = 128;
const tensorCtx = tensorCanvas.getContext("2d", { willReadFrequently: true });

let currentOrigW = 256;
let currentOrigH = 256;
let authSession = null; // { access_token, user }
let authMode = "signin"; // "signin" | "signup"
let galleryMode = "all"; // "all" | "mine"
let allDisastersData = [];
let activeDisasterCategory = "all";

let datasetPage = 0;
let datasetTotal = 0;
let currentDatasetRows = [];
const PAGE_SIZE = 15;

// Helpers
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisaster(slug) {
  if (!slug) return "Unknown Event";
  return (
    DISASTER_NAMES[slug] ||
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function severityPillHtml(cls) {
  const safe = escapeHtml(cls);
  const meta = SEVERITY_META[cls] || { label: safe };
  return `<span class="sev-pill sev-${safe}">${escapeHtml(meta.label)}</span>`;
}

function timeAgo(iso) {
  if (!iso) return "";
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sbFetch(path, { method = "GET", body, headers = {}, rawResponse = false } = {}) {
  const token = authSession?.access_token || SUPABASE_CONFIG.anonKey;
  const res = await fetch(`${SUPABASE_CONFIG.url}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = txt;
    try {
      const parsed = JSON.parse(txt);
      msg = parsed.msg || parsed.error_description || parsed.message || parsed.error || txt;
    } catch {
      // plain text
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (rawResponse) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 1. Theme Toggle
function initTheme() {
  const saved = localStorage.getItem("geovision_theme") || "light";
  applyTheme(saved);
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("geovision_theme", next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("themeIcon");
  if (theme === "dark") {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  } else {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  }
}

// 2. Hero Satellite Comparison Slider
function initHeroSlider() {
  const slider = document.getElementById("satSlider");
  const overlay = document.getElementById("satOverlayLayer");
  const divider = document.getElementById("satDivider");
  const update = () => {
    const v = Number(slider.value);
    overlay.style.clipPath = `inset(0 0 0 ${v}%)`;
    divider.style.left = `${v}%`;
  };
  slider.addEventListener("input", update);
  update();
}

// 3. Supabase Auth Integration
function getDisplayName(user) {
  if (!user) return "";
  return user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "Researcher");
}

async function initAuth() {
  const stored = localStorage.getItem("geovision_supabase_session");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.access_token) {
        const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/user`, {
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${parsed.access_token}`,
          },
        });
        if (res.ok) {
          const user = await res.json();
          authSession = { access_token: parsed.access_token, user };
        } else {
          localStorage.removeItem("geovision_supabase_session");
        }
      }
    } catch {
      localStorage.removeItem("geovision_supabase_session");
    }
  }
  syncAuthUI();

  const modal = document.getElementById("authModal");
  const navBtn = document.getElementById("authNavBtn");
  const closeBtn = document.getElementById("closeAuthModalBtn");
  const signInTab = document.getElementById("modeSignInBtn");
  const signUpTab = document.getElementById("modeSignUpBtn");
  const nameWrap = document.getElementById("authNameWrap");
  const submitBtn = document.getElementById("authSubmitBtn");
  const errBox = document.getElementById("authErrorMsg");

  const setMode = (m) => {
    authMode = m;
    signInTab.classList.toggle("active", m === "signin");
    signUpTab.classList.toggle("active", m === "signup");
    nameWrap.style.display = m === "signup" ? "block" : "none";
    submitBtn.textContent = m === "signup" ? "Create Account & Sign In" : "Sign In";
    errBox.style.display = "none";
  };

  signInTab.addEventListener("click", () => setMode("signin"));
  signUpTab.addEventListener("click", () => setMode("signup"));

  navBtn.addEventListener("click", async () => {
    if (authSession) {
      // Sign out
      try {
        await fetch(`${SUPABASE_CONFIG.url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${authSession.access_token}`,
          },
        });
      } catch {
        // ignore
      }
      authSession = null;
      localStorage.removeItem("geovision_supabase_session");
      if (galleryMode === "mine") {
        galleryMode = "all";
        document.getElementById("filterAllRunsBtn").classList.add("active");
        document.getElementById("filterMyRunsBtn").classList.remove("active");
      }
      syncAuthUI();
      loadRecentAssessments();
      showToast("Signed out of Supabase.");
    } else {
      errBox.style.display = "none";
      modal.classList.add("open");
    }
  });

  closeBtn.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.style.display = "none";
    submitBtn.disabled = true;

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const fullName = document.getElementById("authFullName").value.trim();

    try {
      const endpoint =
        authMode === "signup"
          ? "/auth/v1/signup"
          : "/auth/v1/token?grant_type=password";
      const payload =
        authMode === "signup"
          ? { email, password, data: { full_name: fullName || email.split("@")[0] } }
          : { email, password };

      const res = await fetch(`${SUPABASE_CONFIG.url}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_CONFIG.anonKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || data.error_description || data.message || "Authentication failed");
      }

      const token = data.access_token || data.session?.access_token;
      const user = data.user || data.session?.user;
      if (!token || !user) {
        throw new Error("Account created! Please switch to Sign In.");
      }

      authSession = { access_token: token, user };
      localStorage.setItem("geovision_supabase_session", JSON.stringify({ access_token: token }));
      modal.classList.remove("open");
      syncAuthUI();
      loadRecentAssessments();
      showToast(`Welcome, ${getDisplayName(user)}!`);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function syncAuthUI() {
  const navBtn = document.getElementById("authNavBtn");
  const fbName = document.getElementById("fbName");
  if (authSession?.user) {
    const name = getDisplayName(authSession.user);
    navBtn.textContent = `${name} · Sign Out`;
    if (fbName && !fbName.value) fbName.value = name;
  } else {
    navBtn.textContent = "Sign In";
  }
}

// 4. Live AI Building Analyzer
function initAnalyzer() {
  const cardsWrap = document.getElementById("sampleCards");
  cardsWrap.innerHTML = "";

  SAMPLES.forEach((s, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sample-card" + (idx === 0 ? " active" : "");
    btn.innerHTML = `
      <img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.sampleName)}" />
      <strong>${escapeHtml(s.shortTitle)}</strong>
      <small>${escapeHtml(s.tag)}</small>
    `;
    btn.addEventListener("click", () => selectSample(s, btn, true));
    cardsWrap.appendChild(btn);
  });

  renderConfidenceBars({ "no-damage": 0, "minor-damage": 0, "major-damage": 0, destroyed: 0 });
  renderEmbeddingGrid(new Array(64).fill(0));

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");

  const handleUpload = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    document.querySelectorAll(".sample-card").forEach((c) => c.classList.remove("active"));
    const cleanTitle = file.name.replace(/\.[^.]+$/, "");
    document.getElementById("sampleTitleInput").value = cleanTitle;
    document.getElementById("sampleNotesInput").value = `Uploaded local image (${file.name})`;
    document.getElementById("activeCropTitle").textContent = cleanTitle;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        drawToCanvases(img);
        runEdgeInference(false);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  fileInput.addEventListener("change", (e) => handleUpload(e.target.files[0]));
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files[0]);
  });

  document.getElementById("modelChoice").addEventListener("change", () => runEdgeInference(false));
  document.getElementById("saveAnalyzeBtn").addEventListener("click", () => runEdgeInference(true));

  // Gallery filter buttons
  const allBtn = document.getElementById("filterAllRunsBtn");
  const myBtn = document.getElementById("filterMyRunsBtn");
  allBtn.addEventListener("click", () => {
    galleryMode = "all";
    allBtn.classList.add("active");
    myBtn.classList.remove("active");
    loadRecentAssessments();
  });
  myBtn.addEventListener("click", () => {
    if (!authSession?.user) {
      document.getElementById("authModal").classList.add("open");
      return;
    }
    galleryMode = "mine";
    myBtn.classList.add("active");
    allBtn.classList.remove("active");
    loadRecentAssessments();
  });

  // Boot with first sample
  selectSample(SAMPLES[0], cardsWrap.firstElementChild, true);
}

function drawToCanvases(img) {
  currentOrigW = img.naturalWidth || 128;
  currentOrigH = img.naturalHeight || 128;

  tensorCtx.imageSmoothingEnabled = true;
  tensorCtx.imageSmoothingQuality = "high";
  tensorCtx.clearRect(0, 0, 128, 128);
  tensorCtx.drawImage(img, 0, 0, 128, 128);

  const prevCanvas = document.getElementById("previewCanvas");
  const pCtx = prevCanvas.getContext("2d");
  pCtx.clearRect(0, 0, 128, 128);
  pCtx.drawImage(tensorCanvas, 0, 0);

  document.getElementById("activeCropMeta").textContent =
    `Source ${currentOrigW}×${currentOrigH}px → Standardized 128×128 RGB`;
}

function selectSample(sample, cardEl, autoRun = true) {
  document.querySelectorAll(".sample-card").forEach((c) => c.classList.remove("active"));
  if (cardEl) cardEl.classList.add("active");

  document.getElementById("sampleTitleInput").value = sample.sampleName;
  document.getElementById("sampleNotesInput").value = sample.notes;
  document.getElementById("activeCropTitle").textContent = sample.sampleName;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    drawToCanvases(img);
    if (autoRun) runEdgeInference(false);
  };
  img.src = sample.src;
}

function renderConfidenceBars(probs) {
  const wrap = document.getElementById("confidenceBars");
  wrap.innerHTML = CLASSES.map((cls) => {
    const val = Number(probs[cls] || 0);
    const pct = (val * 100).toFixed(1);
    const meta = SEVERITY_META[cls];
    return `
      <div>
        <div class="conf-row-head">
          <span>${escapeHtml(meta.label)}</span>
          <span class="mono">${pct}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-${cls}" style="width:${Math.max(2, val * 100)}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderEmbeddingGrid(emb) {
  const grid = document.getElementById("embeddingGrid");
  const maxVal = Math.max(...emb, 0.001);
  grid.innerHTML = emb
    .map((v, i) => {
      const alpha = Math.min(1, Math.max(0.1, v / maxVal));
      return `<div class="emb-cell" title="Channel ${i}: ${Number(v).toFixed(4)}" style="background: rgba(2, 132, 199, ${alpha.toFixed(2)});"></div>`;
    })
    .join("");
}

async function runEdgeInference(saveToCloud = false) {
  const saveBtn = document.getElementById("saveAnalyzeBtn");
  const speedPill = document.getElementById("speedPill");
  if (saveToCloud) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Analyzing & Saving to Supabase...";
  }
  speedPill.textContent = "Analyzing...";

  try {
    const rgba = tensorCtx.getImageData(0, 0, 128, 128).data;
    const rgb = new Uint8Array(128 * 128 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }

    const analystName = authSession?.user
      ? getDisplayName(authSession.user)
      : "Guest Researcher";

    const payload = {
      rgb_base64: uint8ToBase64(rgb),
      model: document.getElementById("modelChoice").value,
      sample_name: document.getElementById("sampleTitleInput").value.trim() || "Uploaded Satellite Crop",
      analyst_name: analystName,
      original_width: currentOrigW,
      original_height: currentOrigH,
      notes: document.getElementById("sampleNotesInput").value.trim() || null,
      save_history: saveToCloud,
    };

    if (saveToCloud) {
      payload.crop_png_base64 = tensorCanvas.toDataURL("image/png");
    }

    const token = authSession?.access_token || SUPABASE_CONFIG.anonKey;
    const res = await fetch(SUPABASE_CONFIG.edgePredictUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    const out = await res.json();

    const meta = SEVERITY_META[out.predicted_label] || SEVERITY_META["no-damage"];
    document.getElementById("verdictPillWrap").innerHTML = severityPillHtml(out.predicted_label);
    document.getElementById("verdictHeadline").textContent = meta.headline;
    document.getElementById("verdictExplanation").textContent = meta.desc;
    document.getElementById("verdictConfidence").textContent = `${(out.confidence * 100).toFixed(1)}%`;
    speedPill.textContent = `${Math.round(out.inference_ms)} ms · Supabase Edge`;

    renderConfidenceBars(out.probabilities);
    if (Array.isArray(out.embedding)) renderEmbeddingGrid(out.embedding);
    document.getElementById("rawLogitsBox").textContent =
      `Logits: ${JSON.stringify(out.logits, null, 2)}`;

    if (out.comparison) {
      const bal = out.comparison.balanced;
      const base = out.comparison.baseline;
      document.getElementById("modelCompareNote").innerHTML = `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; align-items:center;">
          <span><strong>Model Comparison:</strong> Balanced CNN predicts ${severityPillHtml(bal.predicted_label)} (${(bal.confidence * 100).toFixed(1)}%)</span>
          <span style="color:var(--text-muted);">vs. Baseline CNN: ${severityPillHtml(base.predicted_label)} (${(base.confidence * 100).toFixed(1)}%)</span>
        </div>
      `;
    }

    if (saveToCloud) {
      showToast("Building assessment saved to Supabase Cloud!");
      await Promise.all([loadRecentAssessments(), loadCloudOverview()]);
    }
  } catch (err) {
    speedPill.textContent = "Connection Error";
    showToast(`Inference failed: ${err.message}`);
  } finally {
    if (saveToCloud) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Analyze Building & Save to Cloud";
    }
  }
}

async function loadRecentAssessments() {
  const wrap = document.getElementById("recentGallery");
  try {
    let query = "/rest/v1/damage_assessments?select=*&order=created_at.desc&limit=8";
    if (galleryMode === "mine" && authSession?.user?.id) {
      query += `&user_id=eq.${authSession.user.id}`;
    }
    const rows = await sbFetch(query);
    if (!rows || !rows.length) {
      wrap.innerHTML = `<div style="grid-column:1/-1; padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg); border:1px solid var(--border);">No saved scans here yet. Click <strong>"Analyze Building &amp; Save to Cloud"</strong> above to save one!</div>`;
      return;
    }

    wrap.innerHTML = rows
      .map((r) => {
        const canDelete = authSession?.user?.id && r.user_id === authSession.user.id;
        const imgHtml = r.crop_image_url
          ? `<img src="${escapeHtml(r.crop_image_url)}" alt="${escapeHtml(r.sample_name)}" loading="lazy" />`
          : `<div style="width:64px;height:64px;border-radius:10px;background:var(--bg-subtle);flex-shrink:0;"></div>`;

        return `
          <div class="gallery-card">
            ${imgHtml}
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; color:var(--text-main); font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(r.sample_name)}">
                ${escapeHtml(r.sample_name)}
              </div>
              <div style="margin:5px 0; display:flex; align-items:center; gap:6px;">
                ${severityPillHtml(r.predicted_label)}
                <span class="mono" style="font-size:0.76rem; color:var(--text-muted);">${(Number(r.confidence) * 100).toFixed(1)}%</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem; color:var(--text-muted);">
                <span>${escapeHtml(r.analyst_name || "Researcher")} · ${timeAgo(r.created_at)}</span>
                ${canDelete ? `<button class="del-scan-btn" data-id="${escapeHtml(r.id)}" style="background:none;border:none;color:var(--dest-fg);cursor:pointer;font-weight:600;padding:0;">Delete</button>` : ""}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    wrap.querySelectorAll(".del-scan-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await sbFetch(`/rest/v1/damage_assessments?id=eq.${id}`, { method: "DELETE" });
          showToast("Removed assessment from Supabase.");
          loadRecentAssessments();
          loadCloudOverview();
        } catch (err) {
          showToast(`Could not delete: ${err.message}`);
        }
      });
    });
  } catch {
    wrap.innerHTML = "";
  }
}

// 5. Cloud Overview & Disaster Insights
async function loadCloudOverview() {
  const pill = document.getElementById("cloudStatusPill");
  const statusText = document.getElementById("cloudStatusText");
  try {
    const overview = await sbFetch("/rest/v1/rpc/get_geovision_overview", {
      method: "POST",
      body: {},
    });

    pill.classList.remove("offline");
    statusText.textContent = "Supabase Live";

    const t = overview.totals;
    document.getElementById("statTotalCrops").textContent = Number(t.total_crops).toLocaleString();
    document.getElementById("statDisasters").textContent = t.disaster_count;
    document.getElementById("statScenes").textContent = Number(t.unique_images).toLocaleString();
    document.getElementById("statAssessments").textContent = Number(overview.total_assessments).toLocaleString();

    allDisastersData = overview.by_disaster || [];
    renderDisasterCards();

    // Populate Dataset Browser Disaster Dropdown once
    const select = document.getElementById("disasterSelect");
    if (select.options.length <= 1) {
      allDisastersData.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.disaster_event;
        opt.textContent = `${formatDisaster(d.disaster_event)} (${Number(d.total).toLocaleString()})`;
        select.appendChild(opt);
      });
    }
  } catch {
    pill.classList.add("offline");
    statusText.textContent = "Offline Preview";
  }
}

function initDisasterCategoryPills() {
  const bar = document.getElementById("categoryFilterBar");
  bar.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeDisasterCategory = btn.dataset.cat;
      bar.querySelectorAll(".filter-pill").forEach((b) => b.classList.toggle("active", b === btn));
      renderDisasterCards();
    });
  });
}

function renderDisasterCards() {
  const grid = document.getElementById("disasterGrid");
  const filtered =
    activeDisasterCategory === "all"
      ? allDisastersData
      : allDisastersData.filter((d) => d.disaster_category === activeDisasterCategory);

  grid.innerHTML = filtered
    .map((d) => {
      const tot = d.total || 1;
      const pNone = ((d.no_damage / tot) * 100).toFixed(1);
      const pMinor = ((d.minor_damage / tot) * 100).toFixed(1);
      const pMajor = ((d.major_damage / tot) * 100).toFixed(1);
      const pDest = ((d.destroyed / tot) * 100).toFixed(1);

      return `
        <div class="disaster-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
            <div>
              <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--brand);">
                ${escapeHtml(d.disaster_category)} · ${d.unique_images} Satellite Scenes
              </span>
              <h3 style="font-size:1.12rem; margin-top:2px;">${escapeHtml(formatDisaster(d.disaster_event))}</h3>
            </div>
            <button class="btn btn-secondary btn-sm jump-disaster-btn" data-ev="${escapeHtml(d.disaster_event)}" type="button">
              Inspect ${Number(d.total).toLocaleString()} →
            </button>
          </div>

          <div class="stacked-bar">
            <div class="bar-no-damage" style="width:${pNone}%" title="No Damage: ${d.no_damage}"></div>
            <div class="bar-minor-damage" style="width:${pMinor}%" title="Minor Damage: ${d.minor_damage}"></div>
            <div class="bar-major-damage" style="width:${pMajor}%" title="Major Damage: ${d.major_damage}"></div>
            <div class="bar-destroyed" style="width:${pDest}%" title="Destroyed: ${d.destroyed}"></div>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:14px; font-size:0.78rem; color:var(--text-muted);">
            <span><strong style="color:var(--none-fg);">${d.no_damage}</strong> No Damage</span>
            <span><strong style="color:var(--minor-fg);">${d.minor_damage}</strong> Minor</span>
            <span><strong style="color:var(--major-fg);">${d.major_damage}</strong> Major</span>
            <span><strong style="color:var(--dest-fg);">${d.destroyed}</strong> Destroyed</span>
          </div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".jump-disaster-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("disasterSelect").value = btn.dataset.ev;
      datasetPage = 0;
      loadDatasetBrowser();
      document.getElementById("dataset").scrollIntoView({ behavior: "smooth" });
    });
  });
}

// 6. Dataset Browser & Record Modal
function initDatasetControls() {
  let timer = null;
  document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      datasetPage = 0;
      loadDatasetBrowser();
    }, 250);
  });

  ["disasterSelect", "damageSelect", "splitSelect"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      datasetPage = 0;
      loadDatasetBrowser();
    });
  });

  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("disasterSelect").value = "all";
    document.getElementById("damageSelect").value = "all";
    document.getElementById("splitSelect").value = "all";
    datasetPage = 0;
    loadDatasetBrowser();
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (datasetPage > 0) {
      datasetPage--;
      loadDatasetBrowser();
    }
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if ((datasetPage + 1) * PAGE_SIZE < datasetTotal) {
      datasetPage++;
      loadDatasetBrowser();
    }
  });

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!currentDatasetRows.length) return;
    const cols = ["id", "disaster_event", "damage_label", "split", "original_width", "original_height", "image_name", "building_id"];
    const csv = [
      cols.join(","),
      ...currentDatasetRows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `geovision_buildings_page_${datasetPage + 1}.csv`;
    a.click();
    showToast("Downloaded current building view as CSV.");
  });

  const recModal = document.getElementById("recordModal");
  document.getElementById("closeRecordModalBtn").addEventListener("click", () => recModal.classList.remove("open"));
  recModal.addEventListener("click", (e) => {
    if (e.target === recModal) recModal.classList.remove("open");
  });
}

async function loadDatasetBrowser() {
  const tbody = document.getElementById("datasetBody");
  const q = document.getElementById("searchInput").value.trim().replace(/[,()]/g, "");
  const dis = document.getElementById("disasterSelect").value;
  const dmg = document.getElementById("damageSelect").value;
  const sp = document.getElementById("splitSelect").value;

  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("order", "id.asc");
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(datasetPage * PAGE_SIZE));

  if (dis !== "all") params.set("disaster_event", `eq.${dis}`);
  if (dmg !== "all") params.set("damage_label", `eq.${dmg}`);
  if (sp !== "all") params.set("split", `eq.${sp}`);
  if (q) {
    params.set("or", `(image_name.ilike.*${q}*,building_id.ilike.*${q}*,disaster_event.ilike.*${q}*)`);
  }

  try {
    const res = await sbFetch(`/rest/v1/crop_manifests?${params.toString()}`, {
      headers: { Prefer: "count=exact" },
      rawResponse: true,
    });
    const range = res.headers.get("content-range") || "";
    const match = range.match(/\/(\d+)$/);
    const rows = await res.json();
    currentDatasetRows = rows;
    datasetTotal = match ? Number(match[1]) : rows.length;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">No buildings match those filters. Try resetting your search.</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map((r, idx) => {
          const splitName = r.split === "train" ? "Training" : "Validation";
          const wBox = Math.max(8, Math.min(24, Math.round(r.original_width / 4)));
          const hBox = Math.max(8, Math.min(24, Math.round(r.original_height / 4)));
          return `
            <tr data-idx="${idx}">
              <td><strong>${escapeHtml(formatDisaster(r.disaster_event))}</strong></td>
              <td>${severityPillHtml(r.damage_label)}</td>
              <td><span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">${splitName}</span></td>
              <td class="mono" style="font-size:0.82rem;">
                <span style="display:inline-flex; align-items:center; gap:8px;">
                  <span style="display:inline-block; width:${wBox}px; height:${hBox}px; border:1.5px solid var(--brand); background:var(--brand-soft); border-radius:3px;"></span>
                  ${r.original_width} × ${r.original_height} px
                </span>
              </td>
              <td class="mono" style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(r.image_name)}</td>
              <td class="mono" style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(r.building_id.slice(0, 13))}…</td>
            </tr>
          `;
        })
        .join("");

      tbody.querySelectorAll("tr[data-idx]").forEach((tr) => {
        tr.addEventListener("click", () => openRecordModal(currentDatasetRows[Number(tr.dataset.idx)]));
      });
    }

    const start = datasetTotal === 0 ? 0 : datasetPage * PAGE_SIZE + 1;
    const end = Math.min(datasetTotal, (datasetPage + 1) * PAGE_SIZE);
    document.getElementById("paginationInfo").textContent =
      `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${datasetTotal.toLocaleString()} buildings`;

    document.getElementById("prevBtn").disabled = datasetPage === 0;
    document.getElementById("nextBtn").disabled = end >= datasetTotal;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:24px; color:var(--dest-fg);">Unable to load records: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function openRecordModal(r) {
  if (!r) return;
  const modal = document.getElementById("recordModal");
  const content = document.getElementById("recordModalContent");
  content.innerHTML = `
    <div style="padding:14px; border-radius:var(--radius-md); background:var(--bg-elevated); border:1px solid var(--border); margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; color:var(--text-main);">${escapeHtml(formatDisaster(r.disaster_event))}</span>
        ${severityPillHtml(r.damage_label)}
      </div>
      <div style="font-size:0.83rem; color:var(--text-muted);">
        ${escapeHtml(SEVERITY_META[r.damage_label]?.desc || "")}
      </div>
    </div>
    <div style="display:grid; gap:9px; font-size:0.85rem;">
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <span style="color:var(--text-muted);">Supabase Row ID</span>
        <strong class="mono">#${r.id}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <span style="color:var(--text-muted);">Dataset Split</span>
        <strong>${r.split === "train" ? "Training Split" : "Validation Split"}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <span style="color:var(--text-muted);">Original Crop Dimensions</span>
        <strong class="mono">${r.original_width} × ${r.original_height} px (${r.crop_area} px²)</strong>
      </div>
      <div style="border-bottom:1px solid var(--border); padding-bottom:6px;">
        <div style="color:var(--text-muted); margin-bottom:2px;">Source Satellite Scene</div>
        <div class="mono" style="font-size:0.78rem; color:var(--text-main); word-break:break-all;">${escapeHtml(r.image_name)}</div>
      </div>
      <div>
        <div style="color:var(--text-muted); margin-bottom:2px;">xView2 Building UUID</div>
        <div class="mono" style="font-size:0.78rem; color:var(--text-main); word-break:break-all;">${escapeHtml(r.building_id)}</div>
      </div>
    </div>
  `;
  modal.classList.add("open");
}

// 7. Research Funnel, Benchmarks & Cloud Downloads
async function loadResearchSection() {
  try {
    const [stages, models] = await Promise.all([
      sbFetch("/rest/v1/pipeline_stages?select=*&order=stage_order.asc"),
      sbFetch("/rest/v1/model_checkpoints?select=*&order=is_recommended.desc"),
    ]);

    document.getElementById("funnelContainer").innerHTML = (stages || [])
      .map(
        (s) => `
        <div style="display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border-radius:var(--radius-md); background:var(--bg-elevated); border:1px solid var(--border);">
          <div class="step-badge" style="margin:0; flex-shrink:0;">${s.stage_order}</div>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; gap:8px;">
              <strong style="color:var(--text-main); font-size:0.9rem;">${escapeHtml(s.title)}</strong>
              <span class="mono" style="font-weight:700; color:var(--brand); font-size:0.86rem;">${Number(s.record_count).toLocaleString()}</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${escapeHtml(s.details?.description || "")}</p>
          </div>
        </div>
      `,
      )
      .join("");

    document.getElementById("benchmarkContainer").innerHTML = (models || [])
      .map(
        (m) => `
        <div style="padding:14px 16px; border-radius:var(--radius-md); background:var(--bg-elevated); border:1px solid ${m.is_recommended ? "var(--brand)" : "var(--border)"};">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
            <strong style="color:var(--text-main); font-size:0.92rem;">
              ${escapeHtml(m.name)}
            </strong>
            <span class="sev-pill ${m.is_recommended ? "sev-no-damage" : "sev-minor-damage"}">
              Macro F1: ${Number(m.macro_f1).toFixed(3)}
            </span>
          </div>
          <p style="font-size:0.81rem; color:var(--text-muted);">${escapeHtml(m.notes || "")}</p>
        </div>
      `,
      )
      .join("");
  } catch {
    // fallback graceful
  }

  const files = [
    {
      title: "Balanced CNN Model",
      sub: "PyTorch .pth · 108 KB",
      url: `${SUPABASE_CONFIG.artifactsBucketUrl}/geovision_pilot_cnn_balanced.pth`,
    },
    {
      title: "Baseline CNN Model",
      sub: "PyTorch .pth · 108 KB",
      url: `${SUPABASE_CONFIG.artifactsBucketUrl}/geovision_pilot_cnn.pth`,
    },
    {
      title: "Training Manifest",
      sub: "6,288 rows · CSV",
      url: `${SUPABASE_CONFIG.artifactsBucketUrl}/train_crops_128_manifest.csv`,
    },
    {
      title: "Validation Manifest",
      sub: "1,675 rows · CSV",
      url: `${SUPABASE_CONFIG.artifactsBucketUrl}/val_crops_128_manifest.csv`,
    },
  ];

  document.getElementById("downloadsGrid").innerHTML = files
    .map(
      (f) => `
      <div class="download-item">
        <div>
          <strong style="display:block; font-size:0.84rem; color:var(--text-main);">${escapeHtml(f.title)}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(f.sub)}</span>
        </div>
        <a class="btn btn-secondary btn-sm" href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" download>↓</a>
      </div>
    `,
    )
    .join("");
}

// 8. Community Feedback Wall (Live Supabase Postgres)
function initFeedbackWall() {
  const form = document.getElementById("feedbackForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("fbSubmitBtn");
    btn.disabled = true;

    const author_name = document.getElementById("fbName").value.trim();
    const author_role = document.getElementById("fbRole").value.trim() || "Visitor";
    const category = document.getElementById("fbCategory").value;
    const message = document.getElementById("fbMessage").value.trim();

    try {
      const body = {
        author_name,
        author_role,
        category,
        message,
        ...(authSession?.user?.id ? { user_id: authSession.user.id } : {}),
      };
      await sbFetch("/rest/v1/project_feedback", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body,
      });
      document.getElementById("fbMessage").value = "";
      showToast("Your note is now live on Supabase!");
      loadFeedbackNotes();
    } catch (err) {
      showToast(`Could not post note: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  loadFeedbackNotes();
}

async function loadFeedbackNotes() {
  const list = document.getElementById("feedbackList");
  try {
    const notes = await sbFetch("/rest/v1/project_feedback?select=*&order=created_at.desc&limit=10");
    if (!notes || !notes.length) {
      list.innerHTML = `<div class="feedback-card" style="color:var(--text-muted);">Be the first to share a note on GeoVision!</div>`;
      return;
    }
    list.innerHTML = notes
      .map((n) => {
        const canDel = authSession?.user?.id && n.user_id === authSession.user.id;
        return `
          <div class="feedback-card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
              <div>
                <strong style="color:var(--text-main); font-size:0.92rem;">${escapeHtml(n.author_name)}</strong>
                <span style="font-size:0.78rem; color:var(--text-muted);"> · ${escapeHtml(n.author_role)}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="eyebrow" style="margin:0; font-size:0.72rem; padding:3px 9px;">${escapeHtml(n.category)}</span>
                ${canDel ? `<button class="del-fb-btn" data-id="${escapeHtml(n.id)}" style="background:none;border:none;color:var(--dest-fg);cursor:pointer;font-size:0.76rem;font-weight:600;">Delete</button>` : ""}
              </div>
            </div>
            <p style="font-size:0.88rem; color:var(--text-body);">${escapeHtml(n.message)}</p>
            <div style="font-size:0.74rem; color:var(--text-soft); margin-top:8px;">${timeAgo(n.created_at)}</div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".del-fb-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await sbFetch(`/rest/v1/project_feedback?id=eq.${btn.dataset.id}`, { method: "DELETE" });
          showToast("Note deleted.");
          loadFeedbackNotes();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch {
    list.innerHTML = "";
  }
}

// Boot Everything
initTheme();
initHeroSlider();
initDisasterCategoryPills();
initDatasetControls();
initFeedbackWall();

(async () => {
  await initAuth();
  initAnalyzer();
  loadCloudOverview();
  loadRecentAssessments();
  loadDatasetBrowser();
  loadResearchSection();
})();
