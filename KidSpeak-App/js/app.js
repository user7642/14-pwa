import { StorageManager } from './storage.js';
import { Downloader } from './downloader.js';

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
            console.error("Lỗi khởi tạo:", error);
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
        // Kiểm tra thư mục thật (Dev)
        try {
            const res = await fetch(`./media/${topicId}/manifest.json`, { method: 'HEAD' });
            if (res.ok) return { available: true, type: 'dev' };
        } catch (e) {}

        // Kiểm tra OPFS (PWA)
        const isStored = await StorageManager.fileExists(`media/${topicId}/manifest.json`);
        if (isStored) return { available: true, type: 'pwa' };

        return { available: false, type: null };
    },

    async renderAccordion() {
        const container = document.getElementById('topic-accordion');
        container.innerHTML = ''; 

        for (const topic of this.config.topics) {
            const sourceInfo = await this.getTopicSource(topic.id);
            const section = document.createElement('div');
            section.className = 'accordion-section';
            
            section.innerHTML = `
                <div class="accordion-header" id="header-${topic.id}">
                    <div class="topic-info">
                        <span class="icon">${topic.icon}</span>
                        <span class="title">${topic.title[this.currentLang]}</span>
                    </div>
                    <div class="topic-actions">
                        ${!sourceInfo.available ? `<button class="btn-download" id="dl-${topic.id}">Tải về</button>` : ''}
                        <span class="status-icon">▼</span>
                    </div>
                </div>
                <div class="download-progress-container" id="container-bar-${topic.id}">
                    <div class="download-progress-bar" id="bar-${topic.id}"></div>
                </div>
                <div class="accordion-content" id="content-${topic.id}"></div>
            `;
            container.appendChild(section);

            section.querySelector('.accordion-header').onclick = (e) => {
                if (e.target.classList.contains('btn-download')) return;
                this.toggleTopic(topic.id, sourceInfo);
            };

            if (!sourceInfo.available) {
                section.querySelector(`#dl-${topic.id}`).onclick = () => this.handleDownload(topic, section);
            }
        }
    },

    async toggleTopic(topicId, sourceInfo) {
        const contentDiv = document.getElementById(`content-${topicId}`);
        const headerDiv = document.getElementById(`header-${topicId}`);

        if (!contentDiv.classList.contains('open')) {
            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('open'));
            document.querySelectorAll('.accordion-header').forEach(el => el.classList.remove('active'));

            contentDiv.classList.add('open');
            headerDiv.classList.add('active');
            
            if (sourceInfo.available) {
                await this.loadItems(topicId, contentDiv, sourceInfo.type);
            } else {
                contentDiv.innerHTML = '<p style="padding:20px; color:#888;">Nhấn "Tải về" để học nhé!</p>';
            }
        } else {
            contentDiv.classList.remove('open');
            headerDiv.classList.remove('active');
        }
    },

    async handleDownload(topic, sectionEl) {
        const dlBtn = sectionEl.querySelector('.btn-download');
        const progressBar = sectionEl.querySelector(`#bar-${topic.id}`);
        dlBtn.disabled = true;

        const success = await Downloader.downloadTopic(topic.id, topic.zipUrl, (progress) => {
            progressBar.style.width = `${progress}%`;
            dlBtn.innerText = `${progress}%`;
        });

        if (success) {
            this.renderAccordion();
        } else {
            alert("Lỗi tải xuống!");
            dlBtn.disabled = false;
        }
    },

    async loadItems(topicId, container, sourceType) {
        container.innerHTML = '<div style="padding:20px;">Đang tải dữ liệu...</div>';
        try {
            let manifest;
            const basePath = (sourceType === 'dev') ? `./media/${topicId}` : `media/${topicId}`;

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
            container.innerHTML = '<div class="error">Lỗi hiển thị dữ liệu.</div>';
        }
    }
};

App.init();
