import { downloadMediaFiles, loadManifestWithPending } from "./downloader.js";
import { getAudioBlob, getImageBlob, initOPFS } from "./opfs.js";

const DB_NAME = "vocab-pwa-db";
const DB_VERSION = 1;
const STORE_META = "meta";
const META_KEY = "download-meta";

const els = {
  overlay: document.querySelector("#download-overlay"),
  count: document.querySelector("#download-count"),
  percent: document.querySelector("#download-percent"),
  bar: document.querySelector("#download-bar"),
  accordion: document.querySelector("#vocab-accordion"),
  empty: document.querySelector("#empty-state"),
  retryButton: document.querySelector("#retry-download"),
  network: document.querySelector("#network-indicator"),
  cardTemplate: document.querySelector("#vocab-card-template"),
  langVi: document.querySelector("#lang-vi"),
  langEn: document.querySelector("#lang-en"),
};

let preferredLang = "vi";

function updateNetworkIndicator() {
  const online = navigator.onLine;
  els.network.textContent = online ? "Online" : "Offline";
  els.network.classList.toggle("online", online);
  els.network.classList.toggle("offline", !online);
}

function setOverlay(visible) {
  els.overlay.classList.toggle("hidden", !visible);
}

function setProgress(done, total) {
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  els.count.textContent = `${done} / ${total} files`;
  els.percent.textContent = `${percent}%`;
  els.bar.style.width = `${percent}%`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const store = tx.objectStore(STORE_META);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    const store = tx.objectStore(STORE_META);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function inferWordName(path) {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

function normalizeItemOrderKey(rawKey) {
  return (rawKey ?? "").trim().replace(/\.[^/.]+$/, "").trim();
}

function normalizeLabelFromBasename(basename) {
  return basename.replace(/[_-]+/g, " ").trim();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}

async function fetchMenuOrder() {
  try {
    const response = await fetch("./assets/media/menu.order.txt", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const entries = text
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const [rawKey, ...rest] = line.split("|");
        const key = normalizeItemOrderKey(rawKey);
        const title = rest.join("|").trim();
        return { key, title: title || key };
      })
      .filter((entry) => entry.key.length > 0);
    return entries;
  } catch (_error) {
    return null;
  }
}

const itemOrderCache = new Map();

async function fetchItemOrderForCategory(category) {
  if (itemOrderCache.has(category)) {
    return itemOrderCache.get(category);
  }

  try {
    const response = await fetch(`./assets/media/image/${category}/item.order.txt`, { cache: "no-store" });
    if (!response.ok) {
      itemOrderCache.set(category, null);
      return null;
    }
    const text = await response.text();
    const entries = text
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const [rawKey, ...rest] = line.split("|");
        const key = normalizeItemOrderKey(rawKey);
        const title = rest.join("|").trim();
        return { key, title: title || normalizeLabelFromBasename(key) };
      })
      .filter((entry) => entry.key.length > 0);

    const labelByBasename = new Map();
    for (const entry of entries) {
      labelByBasename.set(entry.key, entry.title);
    }

    const result = { order: entries.map((e) => e.key), labelByBasename };
    itemOrderCache.set(category, result);
    return result;
  } catch (_error) {
    itemOrderCache.set(category, null);
    return null;
  }
}

function buildMediaIndex(manifest) {
  const imagesByCategory = new Map();
  const audioByCategoryLangBasename = new Map();
  const langs = new Set();

  for (const item of manifest) {
    if (item.type === "image") {
      // image/<category>/<file>
      const parts = item.path.split("/");
      if (parts.length < 3 || parts[0] !== "image") {
        continue;
      }
      const category = parts[1];
      const basename = inferWordName(item.path);
      const list = imagesByCategory.get(category) ?? [];
      list.push({
        basename,
        label: normalizeLabelFromBasename(basename),
        imagePath: item.path,
      });
      imagesByCategory.set(category, list);
      continue;
    }

    if (item.type === "audio") {
      // audio/<category>/<lang>/<file>
      const parts = item.path.split("/");
      if (parts.length < 4 || parts[0] !== "audio") {
        continue;
      }
      const category = parts[1];
      const lang = parts[2];
      langs.add(lang);
      const basename = inferWordName(item.path);
      audioByCategoryLangBasename.set(`${category}::${lang}::${basename}`, item.path);
    }
  }

  for (const [_category, list] of imagesByCategory) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  return { imagesByCategory, audioByCategoryLangBasename, langs: [...langs] };
}

async function setCardImage(imgEl, imagePath, label) {
  imgEl.alt = label;
  try {
    const imageBlob = await getImageBlob(imagePath);
    const imageUrl = URL.createObjectURL(imageBlob);
    imgEl.src = imageUrl;
    imgEl.addEventListener("load", () => URL.revokeObjectURL(imageUrl), { once: true });
  } catch (_error) {
    imgEl.removeAttribute("src");
  }
}

async function playAudioPath(audioPath, label) {
  if (!audioPath) {
    return;
  }
  try {
    const audioBlob = await getAudioBlob(audioPath);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play().catch(() => {});
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
  } catch (_error) {
    console.warn("Audio not available for", label);
  }
}

function pickLangKey(allLangKeys, desired) {
  if (allLangKeys.includes(desired)) {
    return desired;
  }
  const desiredLower = desired.toLowerCase();
  const contains = allLangKeys.find((key) => key.toLowerCase().includes(desiredLower));
  if (contains) {
    return contains;
  }
  return allLangKeys[0] ?? desired;
}

function setPreferredLang(lang) {
  preferredLang = lang;
  const viActive = lang === "vi";
  els.langVi?.classList.toggle("is-active", viActive);
  els.langEn?.classList.toggle("is-active", !viActive);
  els.langVi?.setAttribute("aria-pressed", viActive ? "true" : "false");
  els.langEn?.setAttribute("aria-pressed", viActive ? "false" : "true");
}

async function renderAccordionFromManifest(manifest) {
  els.accordion.innerHTML = "";

  const menuOrder = await fetchMenuOrder();
  if (!menuOrder) {
    els.empty.classList.remove("hidden");
    els.empty.textContent =
      "Chua co file assets/media/menu.order.txt. Hay tao file nay (moi dong 1 thu muc con trong assets/media/image/) de hien thi menu.";
    return;
  }

  const index = buildMediaIndex(manifest);
  const englishKey = pickLangKey(index.langs, "en");
  const vietnameseKey = pickLangKey(index.langs, "vi");
  const resolveLang = () => (preferredLang === "en" ? englishKey : vietnameseKey);
  const categories = menuOrder.filter((entry) => index.imagesByCategory.has(entry.key));

  if (categories.length === 0) {
    els.empty.classList.remove("hidden");
    els.empty.textContent =
      "Khong tim thay category hop le (kiem tra menu.order.txt va assets/media/image/<category>/).";
    return;
  }

  els.empty.classList.add("hidden");

  const renderedCategories = new Set();

  const ensureRenderCategory = async (category, gridEl) => {
    if (renderedCategories.has(category)) {
      return;
    }
    renderedCategories.add(category);

    const baseItems = index.imagesByCategory.get(category) ?? [];
    const itemOrder = await fetchItemOrderForCategory(category);

    let items = baseItems;
    if (itemOrder?.order?.length) {
      const byBasename = new Map(baseItems.map((item) => [item.basename, item]));
      const ordered = [];
      for (const basename of itemOrder.order) {
        const hit = byBasename.get(basename);
        if (hit) {
          ordered.push(hit);
          byBasename.delete(basename);
        }
      }
      const remaining = [...byBasename.values()].sort((a, b) => a.label.localeCompare(b.label));
      items = [...ordered, ...remaining];
    }

    for (const item of items) {
      const customLabel = itemOrder?.labelByBasename?.get(item.basename);
      const label = customLabel ?? item.label;
      const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
      const image = node.querySelector("img");
      const title = node.querySelector("h3");
      title.textContent = label;

      await setCardImage(image, item.imagePath, label);

      const playSound = async () => {
        const lang = resolveLang();
        const audioPath = index.audioByCategoryLangBasename.get(`${category}::${lang}::${item.basename}`);
        await playAudioPath(audioPath, label);
      };

      node.addEventListener("click", playSound);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          playSound();
        }
      });

      gridEl.appendChild(node);
    }
  };

  for (const entry of categories) {
    const category = entry.key;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = entry.title;

    const body = document.createElement("div");
    body.className = "category-body";

    const grid = document.createElement("div");
    grid.className = "category-grid";

    body.appendChild(grid);
    details.appendChild(summary);
    details.appendChild(body);

    details.addEventListener("toggle", () => {
      if (details.open) {
        ensureRenderCategory(category, grid).catch((error) => {
          console.warn("Failed to render category", category, error);
        });
      }
    });

    els.accordion.appendChild(details);
  }
}

async function syncMedia(db, meta) {
  const completedSet = new Set(meta.completedPaths ?? []);
  const { manifest, pending } = await loadManifestWithPending(completedSet);

  if (manifest.length === 0) {
    setOverlay(false);
    setProgress(0, 0);
    await renderAccordionFromManifest([]);
    return;
  }

  const isDone = pending.length === 0;
  if (!isDone) {
    setOverlay(true);
    setProgress(manifest.length - pending.length, manifest.length);
  }

  if (pending.length > 0) {
    await downloadMediaFiles(pending, {
      async onFileSuccess(path) {
        completedSet.add(path);
        const nextMeta = {
          version: String(manifest.length),
          completedPaths: [...completedSet],
          doneCount: completedSet.size,
          totalCount: manifest.length,
          updatedAt: Date.now(),
        };
        await txPut(db, META_KEY, nextMeta);
      },
      onProgress(stats) {
        const done = manifest.length - pending.length + stats.doneCount;
        setProgress(done, manifest.length);
      },
    });
  }

  const completedMeta = {
    version: String(manifest.length),
    completedPaths: [...completedSet],
    doneCount: completedSet.size,
    totalCount: manifest.length,
    updatedAt: Date.now(),
  };
  await txPut(db, META_KEY, completedMeta);

  setOverlay(false);
  await renderAccordionFromManifest(manifest);
}

async function boot() {
  updateNetworkIndicator();
  window.addEventListener("online", updateNetworkIndicator);
  window.addEventListener("offline", updateNetworkIndicator);

  await registerServiceWorker();
  await initOPFS();
  const db = await openDB();
  const meta = (await txGet(db, META_KEY)) ?? {
    version: "0",
    completedPaths: [],
    doneCount: 0,
    totalCount: 0,
    updatedAt: 0,
  };

  els.retryButton.addEventListener("click", async () => {
    await syncMedia(db, { ...meta, completedPaths: [] });
  });

  els.langVi?.addEventListener("click", () => setPreferredLang("vi"));
  els.langEn?.addEventListener("click", () => setPreferredLang("en"));
  setPreferredLang("vi");

  await syncMedia(db, meta);
}

boot().catch((error) => {
  console.error("Application bootstrap failed:", error);
  setOverlay(false);
  els.empty.classList.remove("hidden");
  els.empty.textContent = "Khong the khoi dong ung dung. Vui long thu tai lai trang.";
});
