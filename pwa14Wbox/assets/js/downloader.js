import { fileExists, saveFileToOPFS } from "./opfs.js";

const LOW_END_RAM_GB = 4;
const LOW_END_CORES = 4;
const MAX_RETRIES = 3;

// Resolve next to this module so the manifest URL does not depend on the page URL
// (subfolders, <base href>, or odd server URL mapping).
const MANIFEST_URL = new URL("../media-manifest.json", import.meta.url).href;

function getInitialConcurrency() {
  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  return memory < LOW_END_RAM_GB || cores <= LOW_END_CORES ? 3 : 5;
}

async function fetchManifest() {
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load manifest (${response.status}): ${MANIFEST_URL}`);
  }
  const raw = (await response.text()).trim();
  if (raw.startsWith("<")) {
    throw new Error(`Manifest URL returned HTML, not JSON: ${MANIFEST_URL}`);
  }
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload)) {
    console.warn("media-manifest.json is not an array; falling back to []");
    return [];
  }
  return payload;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFetchUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch (_error) {
    return url;
  }
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  let attempt = 0;
  let lastError = null;
  const resolvedUrl = resolveFetchUrl(url);

  while (attempt < retries) {
    try {
      const response = await fetch(resolvedUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.blob();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt < retries) {
        await delay(200 * attempt);
      }
    }
  }

  throw lastError ?? new Error("Unknown download error");
}

async function resolvePendingFiles(manifest, completedSet) {
  const pending = [];
  for (const item of manifest) {
    if (completedSet.has(item.path)) {
      continue;
    }
    const exists = await fileExists(item.path);
    if (!exists) {
      pending.push(item);
    }
  }
  return pending;
}

export async function loadManifestWithPending(completedSet) {
  const manifest = await fetchManifest();
  const pending = await resolvePendingFiles(manifest, completedSet);
  return { manifest, pending };
}

export async function downloadMediaFiles(files, options) {
  const {
    onFileSuccess,
    onProgress,
    onError,
    startingConcurrency = getInitialConcurrency(),
  } = options;

  let currentIndex = 0;
  let successCount = 0;
  let failureCount = 0;
  let adaptiveConcurrency = Math.max(1, startingConcurrency);
  const total = files.length;
  const activeWorkers = new Set();

  async function worker() {
    while (currentIndex < total) {
      const taskIndex = currentIndex;
      currentIndex += 1;
      const item = files[taskIndex];

      try {
        const blob = await fetchWithRetry(item.url, MAX_RETRIES);
        await saveFileToOPFS(item.path, blob);
        successCount += 1;
        await onFileSuccess(item.path);
      } catch (error) {
        failureCount += 1;
        onError?.(item, error);

        if (failureCount >= 2 && adaptiveConcurrency > 2) {
          adaptiveConcurrency -= 1;
        }
      } finally {
        onProgress({
          successCount,
          failureCount,
          doneCount: successCount + failureCount,
          total,
          concurrency: adaptiveConcurrency,
        });
      }
    }
  }

  while (activeWorkers.size < adaptiveConcurrency) {
    const task = worker().finally(() => activeWorkers.delete(task));
    activeWorkers.add(task);
  }

  // Spawn new workers only when adaptive concurrency grows in future.
  while (activeWorkers.size > 0) {
    await Promise.race(activeWorkers);

    while (activeWorkers.size < adaptiveConcurrency && currentIndex < total) {
      const task = worker().finally(() => activeWorkers.delete(task));
      activeWorkers.add(task);
    }
  }

  return { successCount, failureCount, total };
}
