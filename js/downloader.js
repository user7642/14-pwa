import { StorageManager } from './storage.js';

export const Downloader = {
    async downloadTopic(topicId, zipUrl, version, onProgress) {
        try {
            console.log(`[Downloader] Bắt đầu tải: ${topicId}`);
            
            const response = await axios({
                url: zipUrl,
                method: 'GET',
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    if (progressEvent.total && typeof onProgress === 'function') {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(percentCompleted);
                    }
                }
            });

            console.log(`[Downloader] Đã tải ZIP ${topicId}, kích thước: ${response.data.size} bytes`);

            const zip = await JSZip.loadAsync(response.data);
            const files = Object.keys(zip.files);
            console.log(`[Downloader] ZIP ${topicId} chứa ${files.length} file`);

            let successCount = 0;
            let failCount = 0;

            for (const filename of files) {
                const fileData = zip.files[filename];
                if (!fileData.dir) {
                    try {
                        const content = await fileData.async('blob');
                        
                        if (content.size === 0) {
                            console.warn(`[Downloader] File rỗng trong ZIP: ${filename}`);
                            failCount++;
                            continue;
                        }

                        await StorageManager.saveFile(`media/${topicId}/${filename}`, content);
                        successCount++;
                    } catch (err) {
                        console.error(`[Downloader] Lỗi lưu file ${filename}:`, err);
                        failCount++;
                    }
                }
            }

            console.log(`[Downloader] Hoàn thành ${topicId}: ${successCount} file lưu thành công, ${failCount} thất bại`);

            if (failCount > 0) {
                console.warn(`[Downloader] Cảnh báo: ${failCount} file không được lưu thành công`);
            }

            // Lưu phiên bản vào máy sau khi giải nén xong
            localStorage.setItem(`v_${topicId}`, version);
            console.log(`[Downloader] Lưu version ${topicId}@${version}`);

            return true;
        } catch (error) {
            console.error(`[Downloader] Lỗi tải ${topicId}:`, error);
            return false;
        }
    }
};