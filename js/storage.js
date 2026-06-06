/**
 * storage.js - Quản lý đọc/ghi dữ liệu vào OPFS
 */
export const StorageManager = {
    async getRoot() {
        return await navigator.storage.getDirectory();
    },

    async saveFile(path, blob) {
        const parts = path.split('/');
        const fileName = parts.pop();
        let currentDir = await this.getRoot();

        for (const part of parts) {
            currentDir = await currentDir.getDirectoryHandle(part, { create: true });
        }

        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    },

    async fileExists(path) {
        try {
            const parts = path.split('/');
            const fileName = parts.pop();
            let currentDir = await this.getRoot();

            for (const part of parts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            await currentDir.getFileHandle(fileName);
            return true;
        } catch (e) {
            return false;
        }
    },

    async removeDirectory(path) {
        try {
            const parts = path.split('/');
            const dirName = parts.pop();
            let currentDir = await this.getRoot();

            for (const part of parts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            await currentDir.removeEntry(dirName, { recursive: true });
            return true;
        } catch (e) {
            console.warn(`[StorageManager] Không xóa được thư mục OPFS: ${path}`, e.message);
            return false;
        }
    },

    // HÀM QUAN TRỌNG CÒN THIẾU: Lấy file từ OPFS trả về File object
    async getFile(path) {
        try {
            const parts = path.split('/');
            const fileName = parts.pop();
            let currentDir = await this.getRoot();

            for (const part of parts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            const fileHandle = await currentDir.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            
            if (file.size === 0) {
                console.warn(`[StorageManager] File rỗng (0 bytes): ${path}`);
                return file; // Vẫn trả về file, nhưng log cảnh báo
            }
            
            return file;
        } catch (e) {
            console.error(`[StorageManager] Không thể lấy file từ OPFS: ${path}`, e.message);
            return null;
        }
    }
};
