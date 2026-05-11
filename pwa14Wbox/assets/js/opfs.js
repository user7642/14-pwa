const ROOT_FOLDER = "media";

async function getRootDirectory() {
  if (!navigator.storage?.getDirectory) {
    throw new Error("OPFS is not supported on this browser");
  }

  const storageRoot = await navigator.storage.getDirectory();
  return storageRoot.getDirectoryHandle(ROOT_FOLDER, { create: true });
}

function splitPath(path) {
  return path.split("/").map((segment) => segment.trim()).filter(Boolean);
}

async function getOrCreateDirectory(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export async function initOPFS() {
  await getRootDirectory();
}

export async function saveFileToOPFS(path, blob) {
  const root = await getRootDirectory();
  const segments = splitPath(path);
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error(`Invalid OPFS file path: ${path}`);
  }

  const folder = await getOrCreateDirectory(root, segments);
  const fileHandle = await folder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function getFileFromOPFS(path) {
  const root = await getRootDirectory();
  const segments = splitPath(path);
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error(`Invalid OPFS file path: ${path}`);
  }

  const folder = await getOrCreateDirectory(root, segments);
  const fileHandle = await folder.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
}

export async function fileExists(path) {
  try {
    await getFileFromOPFS(path);
    return true;
  } catch (_error) {
    return false;
  }
}

export async function getAudioBlob(path) {
  return getFileFromOPFS(path);
}

export async function getImageBlob(path) {
  return getFileFromOPFS(path);
}
