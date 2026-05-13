import { StorageManager } from './storage.js';
import { Downloader } from './downloader.js';

// Đăng ký Service Worker cho PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW: Đã đăng ký thành công!', reg.scope))
            .catch(err => console.error('SW: Đăng ký thất bại:', err));
    });
}

const App = {
    config: null,
    currentLang: 'vi',

    async init() {
        try {
            const response = await fetch('./data.json');
            this.config = await response.json();
            this.setupLanguageSwitch();
            await this.renderAccordion();
        } catch (error) {
            console.error("Lỗi khởi tạo ứng dụng:", error);
        }
    },

    setupLanguageSwitch() {
        document.getElementById('btn-vi').onclick = () => this.switchLang('vi');
        document.getElementById('btn-en').onclick = () => this.switchLang('en');
    },

    switchLang(lang) {
        if (this.currentLang === lang) return;
        this.currentLang = lang;
        document.getElementById('btn-vi').classList.toggle('active', lang === 'vi');
        document.getElementById('btn-en').classList.toggle('active', lang === 'en');
        this.renderAccordion();
    },

    async getTopicSource(topicId) {
        // Kiểm tra xem dữ liệu đang nằm ở thư mục thật (Dev) hay trong Storage (OPFS)
        try {
            const res = await fetch(`./media/${topicId}/manifest.json`, { method: 'HEAD' });
            if (res.ok) return { type: 'dev', path: `./media/${topicId}` };
        } catch (e) {}

        const exists = await StorageManager.fileExists(`media/${topicId}/manifest.json`);
        if (exists) return { type: 'storage', path: `media/${topicId}` };
        
        return null;
    },

    async renderAccordion() {
        const container = document.getElementById('topic-accordion');
        if (!container) return;
        container.innerHTML = '';

        for (const topic of this.config.topics) {
            const source = await this.getTopicSource(topic.id);
            const localVersion = localStorage.getItem(`v_${topic.id}`) || 0;
            
            let status = 'DOWNLOAD';
            if (source) {
                // Nếu ở chế độ Dev hoặc phiên bản khớp/mới hơn thì coi như READY
                status = (source.type === 'dev' || parseInt(topic.v) <= parseInt(localVersion)) ? 'READY' : 'UPDATE';
            }

            const section = document.createElement('div');
            section.className = `accordion-section ${status === 'READY' ? 'is-ready' : ''} topic-${topic.id}`;
            
            let actionHtml = '';
            if (status === 'DOWNLOAD') {
                actionHtml = `<button class="btn-download" id="btn-${topic.id}" onclick="App.handleDownload('${topic.id}')">Tải về (${topic.size})</button>`;
            } else if (status === 'UPDATE') {
                actionHtml = `<button class="btn-update" id="btn-${topic.id}" onclick="App.handleDownload('${topic.id}')">Cập nhật</button>`;
            } 
            // Nếu READY: actionHtml để trống hoàn toàn cho giao diện sạch.

            section.innerHTML = `
                <div class="accordion-header" onclick="App.toggleAccordion('${topic.id}', '${status}')">
                    <div class="header-center-content">
                        <span class="topic-icon">${topic.icon}</span>
                        <h3 class="topic-title">
                            ${this.currentLang === 'vi' ? topic.title.vi : topic.title.en}
                        </h3>
                    </div>
                    <div class="actions" onclick="event.stopPropagation()">${actionHtml}</div>
                </div>
                <div class="accordion-content" id="content-${topic.id}"></div>
            `;
            container.appendChild(section);
        }
    },

    async handleDownload(topicId) {
        const topic = this.config.topics.find(t => t.id === topicId);
        const btn = document.getElementById(`btn-${topicId}`);
        if (!topic || !btn) return;

        btn.disabled = true;
        const originalText = btn.innerText;

        const success = await Downloader.downloadTopic(
            topic.id, 
            topic.zipUrl, 
            topic.v, 
            (percent) => {
                // Hiển thị % tải thực tế lên nút
                btn.innerText = `Đang tải: ${percent}%`;
            }
        );

        if (success) {
            await this.renderAccordion();
        } else {
            btn.disabled = false;
            btn.innerText = originalText;
            console.error(`Tải gói ${topicId} thất bại.`);
        }
    },

    async toggleAccordion(topicId, status) {
        const content = document.getElementById(`content-${topicId}`);
        const header = content?.previousElementSibling;
        if (!content) return;

        if (content.classList.contains('open')) {
            content.classList.remove('open');
            header.classList.remove('active');
        } else {
            // Đóng tất cả accordion khác trước khi mở cái mới
            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('open'));
            document.querySelectorAll('.accordion-header').forEach(el => el.classList.remove('active'));
            
            if (status === 'READY') {
                await this.renderTopicContent(topicId, content);
            } else {
                // Thay vì alert, hiển thị text nhắc nhở ngay trong lòng accordion
                content.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #888; font-style: italic; width: 100%;">
                        Nhấn "Tải về" để học nhé!
                    </div>`;
            }
            
            content.classList.add('open');
            header.classList.add('active');
        }
    },

    async renderTopicContent(topicId, container) {
        try {
            const source = await this.getTopicSource(topicId);
            if (!source) return;

            const basePath = source.path;
            const sourceType = source.type;
            let manifest;

            if (sourceType === 'dev') {
                const res = await fetch(`${basePath}/manifest.json`);
                manifest = await res.json();
            } else {
                const file = await StorageManager.getFile(`${basePath}/manifest.json`);
                manifest = JSON.parse(await file.text());
            }

            container.innerHTML = '';
            for (const item of manifest.items) {
                const card = document.createElement('div');
                card.className = 'item-card';

                let imgUrl = (sourceType === 'dev')
                    ? `${basePath}/img/${item.img}`
                    : URL.createObjectURL(await StorageManager.getFile(`${basePath}/img/${item.img}`));

                card.innerHTML = `
                    <img src="${imgUrl}" loading="lazy">
                    <p>${this.currentLang === 'vi' ? item.name_vi : item.name_en}</p>
                `;

                card.onclick = async () => {
                    let audioUrl = (sourceType === 'dev')
                        ? `${basePath}/mp3/${this.currentLang}/${item.audio}`
                        : URL.createObjectURL(await StorageManager.getFile(`${basePath}/mp3/${this.currentLang}/${item.audio}`));
                    new Audio(audioUrl).play();
                };
                container.appendChild(card);
            }
        } catch (error) {
            container.innerHTML = '<div class="error">Lỗi hiển thị dữ liệu hoặc file không tồn tại.</div>';
        }
    }
};

App.init();
window.App = App;