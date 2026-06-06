#!/bin/bash
# Chạy từ thư mục gốc của project Arch Linux

SOURCE_DIR="./media"
OUTPUT_DIR="./assets/zips"

# Tạo thư mục đầu ra nếu chưa có
mkdir -p "$OUTPUT_DIR"

echo "🚀 Đang đóng gói Media vào $OUTPUT_DIR..."

for dir in "$SOURCE_DIR"/*/; do
  topic_name=$(basename "$dir")
  if [ ! -d "$dir" ]; then continue; fi

  echo "📦 Đang nén: $topic_name..."
  
  # Nén nội dung bên trong thư mục con và đẩy ra thư mục assets/zips
  (cd "$dir" && zip -r "../../$OUTPUT_DIR/$topic_name.zip" . -x "*.DS_Store*")
  
  echo "✅ Đã tạo: $OUTPUT_DIR/$topic_name.zip"
done

echo "🎉 Xong! Các file ZIP đã nằm gọn trong $OUTPUT_DIR."
