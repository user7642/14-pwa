/**
 * downloader.js - Tải gói ZIP và giải nén vào Storage
 */
import { StorageManager } from './storage.js';

export const Downloader = {
    async downloadTopic(topicId, zipUrl, onProgress) {
        try {
            // 1. Tải file ZIP bằng Axios để theo dõi tiến độ (%)
            const response = await axios({
                url: zipUrl,
                method: 'GET',
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    if (onProgress) onProgress(percentCompleted);
                }
            });

            // 2. Dùng JSZip để đọc nội dung file vừa tải
            const zip = await JSZip.loadAsync(response.data);
            const files = Object.keys(zip.files);
            let processed = 0;

            // 3. Lặp qua từng file trong ZIP và lưu vào OPFS
            for (const filename of files) {
                const fileData = zip.files[filename];
                if (!fileData.dir) {
                    const content = await fileData.async('blob');
                    // Đường dẫn lưu: media/topicId/tên_file
                    await StorageManager.saveFile(`media/${topicId}/${filename}`, content);
                }
                processed++;
            }

            console.log(`Đã tải xong chủ đề: ${topicId}`);
            return true;
        } catch (error) {
            console.error("Lỗi khi tải hoặc giải nén:", error);
            return false;
        }
    }
};
