import { StorageManager } from './storage.js';

export const Downloader = {
    async downloadTopic(topicId, zipUrl, version, onProgress) {
        try {
            const response = await axios({
                url: zipUrl,
                method: 'GET',
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    // Kiểm tra an toàn: chỉ gọi nếu onProgress là một hàm
                    if (progressEvent.total && typeof onProgress === 'function') {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(percentCompleted);
                    }
                }
            });

            const zip = await JSZip.loadAsync(response.data);
            const files = Object.keys(zip.files);

            for (const filename of files) {
                const fileData = zip.files[filename];
                if (!fileData.dir) {
                    const content = await fileData.async('blob');
                    await StorageManager.saveFile(`media/${topicId}/${filename}`, content);
                }
            }

            // Lưu phiên bản vào máy sau khi giải nén xong
            localStorage.setItem(`v_${topicId}`, version);
            return true;
        } catch (error) {
            console.error("[Downloader] Lỗi:", error);
            return false;
        }
    }
};