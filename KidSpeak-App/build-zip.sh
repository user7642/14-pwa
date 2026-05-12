#!/bin/bash
# Chạy từ thư mục gốc của project Arch Linux

SOURCE_DIR="./media"
echo "🚀 Đang đóng gói Media (Cấu trúc phẳng)..."

for dir in "$SOURCE_DIR"/*/; do
    # Lấy tên thư mục (ví dụ: fruits)
    topic_name=$(basename "$dir")
    
    # Bỏ qua nếu là file hoặc không phải thư mục
    if [ ! -d "$dir" ]; then continue; fi

    echo "📦 Đang nén: $topic_name..."
    
    # Nén nội dung bên trong, file ZIP sẽ nằm ở thư mục gốc
    (cd "$dir" && zip -r "../$topic_name.zip" . -x "*.DS_Store*" -x "__MACOSX*")
    
    echo "✅ Đã tạo: $topic_name.zip"
done

echo "🎉 Xong! Các file ZIP đã sẵn sàng ở thư mục gốc."
