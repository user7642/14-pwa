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
    downloadStatus: {},

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
            
            const actionHtml = this.getTopicActionHtml(topic, status);

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

    getTopicActionHtml(topic, status) {
        const downloadState = this.downloadStatus[topic.id];
        if (downloadState?.status === 'downloading') {
            return `<button class="btn-downloading" id="btn-${topic.id}" disabled>Đang tải: ${downloadState.progress}%</button>`;
        }

        if (status === 'DOWNLOAD') {
            return `<button class="btn-download" id="btn-${topic.id}" onclick="App.handleDownload('${topic.id}')">Tải về (${topic.size})</button>`;
        }

        if (status === 'UPDATE') {
            return `<button class="btn-update" id="btn-${topic.id}" onclick="App.handleDownload('${topic.id}')">Cập nhật</button>`;
        }

        return '';
    },

    async updateTopicSection(topicId) {
        const section = document.querySelector(`.topic-${topicId}`);
        const topic = this.config.topics.find(t => t.id === topicId);
        if (!section || !topic) return;

        const source = await this.getTopicSource(topic.id);
        const localVersion = localStorage.getItem(`v_${topic.id}`) || 0;
        let status = 'DOWNLOAD';
        if (source) {
            status = (source.type === 'dev' || parseInt(topic.v) <= parseInt(localVersion)) ? 'READY' : 'UPDATE';
        }

        const actionDiv = section.querySelector('.actions');
        const header = section.querySelector('.accordion-header');
        if (actionDiv) {
            actionDiv.innerHTML = this.getTopicActionHtml(topic, status);
        }
        if (header) {
            header.setAttribute('onclick', `App.toggleAccordion('${topic.id}', '${status}')`);
        }

        section.className = `accordion-section ${status === 'READY' ? 'is-ready' : ''} topic-${topic.id}`;

        const content = section.querySelector('.accordion-content');
        if (status === 'READY' && content?.classList.contains('open')) {
            await this.renderTopicContent(topicId, content);
        }
    },

    updateDownloadButton(topicId) {
        const downloadState = this.downloadStatus[topicId];
        if (!downloadState) return;

        const btn = document.getElementById(`btn-${topicId}`);
        if (!btn) return;

        btn.disabled = true;
        btn.innerText = `Đang tải: ${downloadState.progress}%`;
    },

    async handleDownload(topicId) {
        const topic = this.config.topics.find(t => t.id === topicId);
        if (!topic) return;

        this.downloadStatus[topicId] = { status: 'downloading', progress: 0 };
        this.updateDownloadButton(topicId);

        const success = await Downloader.downloadTopic(
            topic.id,
            topic.zipUrl,
            topic.v,
            (percent) => {
                const state = this.downloadStatus[topicId];
                if (!state) return;
                state.progress = percent;
                this.updateDownloadButton(topicId);
            }
        );

        delete this.downloadStatus[topicId];
        await this.updateTopicSection(topicId);

        if (!success) {
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
            if (!source) {
                container.innerHTML = '<div class="error">Chủ đề chưa được tải về. Vui lòng tải về trước.</div>';
                return;
            }

            const basePath = source.path;
            const sourceType = source.type;
            let manifest;

            if (sourceType === 'dev') {
                const res = await fetch(`${basePath}/manifest.json`);
                if (!res.ok) throw new Error(`Không thể lấy manifest: ${res.status}`);
                manifest = await res.json();
            } else {
                const file = await StorageManager.getFile(`${basePath}/manifest.json`);
                if (!file) throw new Error('Manifest.json không tồn tại trong OPFS');
                manifest = JSON.parse(await file.text());
            }

            if (!manifest?.items || !Array.isArray(manifest.items)) {
                throw new Error('Manifest không có định dạng đúng (thiếu trường items)');
            }

            container.innerHTML = '';
            for (const item of manifest.items) {
                try {
                    const card = document.createElement('div');
                    card.className = 'item-card';

                    let imgUrl;
                    if (sourceType === 'dev') {
                        imgUrl = `${basePath}/img/${item.img}`;
                    } else {
                        const imgFile = await StorageManager.getFile(`${basePath}/img/${item.img}`);
                        if (!imgFile) {
                            console.warn(`Ảnh không tồn tại: ${basePath}/img/${item.img}`);
                            continue; // Bỏ qua item này nếu ảnh không có
                        }
                        imgUrl = URL.createObjectURL(imgFile);
                    }

                    card.innerHTML = `
                        <img src="${imgUrl}" loading="lazy">
                        <p>${this.currentLang === 'vi' ? item.name_vi : item.name_en}</p>
                    `;

                    card.onclick = async () => {
                        try {
                            let audioUrl;
                            if (sourceType === 'dev') {
                                audioUrl = `${basePath}/mp3/${this.currentLang}/${item.audio}`;
                            } else {
                                const audioFile = await StorageManager.getFile(`${basePath}/mp3/${this.currentLang}/${item.audio}`);
                                if (!audioFile) {
                                    console.warn(`Audio không tồn tại: ${basePath}/mp3/${this.currentLang}/${item.audio}`);
                                    return;
                                }
                                audioUrl = URL.createObjectURL(audioFile);
                            }
                            new Audio(audioUrl).play();
                        } catch (err) {
                            console.error(`Lỗi phát audio cho ${item.audio}:`, err);
                        }
                    };
                    container.appendChild(card);
                } catch (itemErr) {
                    console.error(`Lỗi xử lý item ${item.name_vi || item.name_en}:`, itemErr);
                }
            }

            if (container.children.length === 0) {
                container.innerHTML = '<div class="error">Không có dữ liệu để hiển thị.</div>';
            }
        } catch (error) {
            console.error(`Lỗi renderTopicContent(${topicId}):`, error);
            container.innerHTML = `<div class="error">Lỗi tải dữ liệu: ${error.message}</div>`;
        }
    }
};

App.init();
window.App = App;