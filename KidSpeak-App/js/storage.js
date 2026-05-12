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
            return await fileHandle.getFile();
        } catch (e) {
            console.error("Lỗi lấy file từ OPFS:", path, e);
            return null;
        }
    }
};
