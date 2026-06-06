async function getMediaUrl(topicId, type, fileName, lang = '') {
    // 1. Thử tìm ở thư mục local (Chỉ chạy khi bạn đang dev)
    const localPath = lang 
        ? `./media/${topicId}/mp3/${lang}/${fileName}` 
        : `./media/${topicId}/img/${fileName}`;
    
    // Kiểm tra nhanh xem file local có tồn tại không (dùng fetch HEAD)
    try {
        const check = await fetch(localPath, { method: 'HEAD' });
        if (check.ok) return localPath;
    } catch (e) { /* Không có file local, bỏ qua */ }

    // 2. Nếu không có local, lấy từ kho OPFS (Dành cho người dùng thật)
    return await StorageManager.getFileUrl(`media/${topicId}/${type}${lang ? '/' + lang : ''}`, fileName);
}
