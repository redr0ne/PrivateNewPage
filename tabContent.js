const MAX_FAVORITES = 15;
const MAX_RECENT = 10;

class ImageSearch {
    constructor(searchInput) {
        this.searchInput = searchInput;
        this.setupImageHandling();
    }

    setupImageHandling() {
        const handlePaste = async (e) => {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    await this.handleImageSearch(file);
                }
            }
        };

        const handleDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.searchInput.classList.add('drag-over');
        };

        const handleDragLeave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.searchInput.classList.remove('drag-over');
        };

        const handleDrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.searchInput.classList.remove('drag-over');

            const items = e.dataTransfer.items;
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    await this.handleImageSearch(file);
                }
            }
        };

        this.searchInput.addEventListener('paste', handlePaste);
        this.searchInput.addEventListener('dragover', handleDragOver);
        this.searchInput.addEventListener('dragleave', handleDragLeave);
        this.searchInput.addEventListener('drop', handleDrop);
    }

    async handleImageSearch(file) {
        try {
            const formData = new FormData();
            formData.append('rpt', 'imageview');
            formData.append('source', 'collections');
            formData.append('upfile', file);

            const searchUrl = 'https://yandex.ru/images/search';
            const response = await fetch(searchUrl, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                chrome.tabs.create({ url: response.url });
            } else {
                console.error('Failed to search image:', response.status);
            }
        } catch (error) {
            console.error('Failed to search image:', error);
        }
    }
}

class TabContentManager {
    constructor() {
        this.favorites = [];
        this.modal = document.getElementById('addSiteModal');
        this.form = document.getElementById('addSiteForm');
        this.grid = document.getElementById('favoritesGrid');
        this.recentGrid = document.getElementById('recentSitesGrid');
        this.topSitesGrid = document.getElementById('topSitesGrid');
        this.urlInput = document.getElementById('siteUrl');
        this.init();
    }

    async init() {
        this.favorites = await this.loadFavorites();
        this.bindEvents();
        this.renderFavorites();
        this.setupUrlValidation();
        this.loadRecentSites();
        this.loadTopSites();
    }

    async loadFavorites() {
        const data = await chrome.storage.local.get('favorites');
        return data.favorites || [];
    }

    bindEvents() {
        document.getElementById('addSiteButton').addEventListener('click', () => this.openModal());
        document.getElementById('cancelAddSite').addEventListener('click', () => this.closeModal());
        this.form.addEventListener('submit', (e) => this.handleAddSite(e));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.closeModal();
            }
        });

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // Обработчик кнопки поиска в Яндексе
        const yandexBtn = document.getElementById('yandexSearchButton');
        if (yandexBtn) {
            yandexBtn.addEventListener('click', () => {
                const query = document.querySelector('.search-input').value;
                if (query.trim() !== "") {
                    chrome.tabs.create({ url: "https://yandex.ru/search/?text=" + encodeURIComponent(query) });
                }
            });
        }
    }

    setupUrlValidation() {
        this.urlInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value && !value.includes('.')) {
                this.urlInput.setCustomValidity('Пожалуйста, введите корректный URL');
            } else {
                this.urlInput.setCustomValidity('');
            }
        });
    }

    async loadRecentSites() {
        try {
            const historyItems = await new Promise((resolve) => {
                chrome.history.search({
                    text: '',
                    maxResults: MAX_RECENT * 3,
                    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000
                }, resolve);
            });

            const uniqueSites = new Map();
            historyItems.forEach(item => {
                try {
                    const url = new URL(item.url);
                    if (url.protocol === 'chrome:' || !item.title?.trim()) {
                        return;
                    }
                    if (!uniqueSites.has(item.url)) {
                        uniqueSites.set(item.url, {
                            url: item.url,
                            title: item.title,
                            visitCount: item.visitCount,
                            lastVisitTime: item.lastVisitTime,
                            domain: url.hostname
                        });
                    }
                } catch (e) {
                    console.error('Invalid URL:', item.url);
                }
            });

            const recentSites = Array.from(uniqueSites.values())
                .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
                .slice(0, MAX_RECENT);

            this.renderRecentSites(recentSites);
        } catch (error) {
            console.error('Failed to load recent sites:', error);
        }
    }

renderRecentSites(sites) {
    if (!this.recentGrid) return;
    this.recentGrid.innerHTML = '';
    sites.forEach(site => {
        const tile = document.createElement('a');
        tile.href = site.url;
        tile.className = 'site-tile';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'site-icon';
        // Используем универсальную функцию для создания favicon
        const img = utils.createFaviconImg(site);
        iconDiv.appendChild(img);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'site-title';
        titleSpan.textContent = site.title;

        const siteActions = document.createElement('div');
        siteActions.className = 'site-actions';

        const removeButton = document.createElement('button');
        removeButton.className = 'site-remove';
        removeButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        `;
        removeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeRecentSite(site.url);
        });

        siteActions.appendChild(removeButton);
        tile.appendChild(iconDiv);
        tile.appendChild(titleSpan);
        tile.appendChild(siteActions);
        this.recentGrid.appendChild(tile);
    });
}
    
    async removeRecentSite(url) {
        try {
            await chrome.history.deleteUrl({ url });
            await this.loadRecentSites();
        } catch (error) {
            console.error('Failed to remove recent site:', error);
            alert('Не удалось удалить сайт из истории');
        }
    }

    async loadTopSites() {
        try {
            chrome.topSites.get((topSites) => {
                this.renderTopSites(topSites);
            });
        } catch (error) {
            console.error('Failed to load top sites:', error);
        }
    }

renderTopSites(sites) {
    if (!this.topSitesGrid) return;
    this.topSitesGrid.innerHTML = '';
    // Ограничиваем вывод первыми 20 сайтами
    const sitesToRender = sites.slice(0, 20);
    sitesToRender.forEach(site => {
        const tile = document.createElement('a');
        tile.href = site.url;
        tile.className = 'site-tile';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'site-icon';
        // Используем утилиту для создания favicon
        const img = utils.createFaviconImg(site);
        iconDiv.appendChild(img);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'site-title';
        titleSpan.textContent = site.title;

        tile.appendChild(iconDiv);
        tile.appendChild(titleSpan);
        this.topSitesGrid.appendChild(tile);
    });
}
    async handleAddSite(e) {
        e.preventDefault();

        const titleInput = document.getElementById('siteTitle');
        const urlInput = document.getElementById('siteUrl');
        const siteId = this.form.dataset.editId;

        try {
            const formattedUrl = utils.formatUrl(urlInput.value);
            let title = titleInput.value.trim();

            if (!title) {
                try {
                    const metadata = await utils.getSiteMetadata(formattedUrl);
                    title = metadata.title;
                } catch (error) {
                    alert('Не удалось добавить сайт: ' + error.message);
                    return;
                }
            }

            if (siteId) {
                await this.editSite(parseInt(siteId), title, formattedUrl);
            } else {
                await this.addSite(title, formattedUrl);
            }

            this.closeModal();
        } catch (error) {
            alert('Пожалуйста, проверьте правильность URL: ' + error.message);
            return;
        }
    }

    openModal(site = null) {
        this.modal.classList.add('active');
        this.form.reset();

        if (site) {
            document.getElementById('siteTitle').value = site.title;
            this.urlInput.value = site.url;
            this.form.dataset.editId = site.id;
            document.querySelector('.modal-title').textContent = 'Редактировать сайт';
            document.querySelector('.modal-button-submit').textContent = 'Сохранить';
        } else {
            delete this.form.dataset.editId;
            document.querySelector('.modal-title').textContent = 'Добавить сайт';
            document.querySelector('.modal-button-submit').textContent = 'Добавить';
        }
    }

    closeModal() {
        this.modal.classList.remove('active');
        this.form.reset();
    }

    async addSite(title, url) {
        if (this.favorites.length >= MAX_FAVORITES) {
            alert(`Достигнут лимит избранных сайтов (${MAX_FAVORITES}). Удалите ненужные сайты, чтобы добавить новые.`);
            return;
        }

        const site = {
            id: Date.now(),
            title,
            url,
            icon: this.getIconLetter(title)
        };

        this.favorites.push(site);
        await this.saveFavorites();
        this.renderFavorites();
    }

    async editSite(id, title, url) {
        const index = this.favorites.findIndex(site => site.id === id);
        if (index !== -1) {
            this.favorites[index] = {
                ...this.favorites[index],
                title,
                url,
                icon: this.getIconLetter(title)
            };
            await this.saveFavorites();
            this.renderFavorites();
        }
    }

    async removeSite(id) {
        this.favorites = this.favorites.filter(site => site.id !== id);
        await this.saveFavorites();
        this.renderFavorites();
    }

reorderFavorites(draggedId, targetId) {
    const draggedIndex = this.favorites.findIndex(site => site.id === draggedId);
    const targetIndex = this.favorites.findIndex(site => site.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const [draggedItem] = this.favorites.splice(draggedIndex, 1);
    this.favorites.splice(targetIndex, 0, draggedItem);
    this.saveFavorites();

    const draggedElem = document.querySelector(`[data-id="${draggedId}"]`);
    const targetElem = document.querySelector(`[data-id="${targetId}"]`);
    if (draggedElem && targetElem && draggedElem !== targetElem) {
         targetElem.parentNode.insertBefore(draggedElem, targetElem);
    }
}


    getIconLetter(title) {
        return title.charAt(0).toUpperCase();
    }

    async saveFavorites() {
        await chrome.storage.local.set({ favorites: this.favorites });
    }

// Пример для renderFavorites:
renderFavorites() {
    this.grid.innerHTML = '';
    this.favorites.forEach(site => {
        const tile = document.createElement('a');
        tile.href = site.url;
        tile.className = 'site-tile';
        tile.dataset.id = site.id;
        tile.draggable = true;

        tile.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData("text/plain", site.id);
        });
        tile.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        tile.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData("text/plain");
            this.reorderFavorites(parseInt(draggedId), site.id);
        });

        const iconDiv = document.createElement('div');
        iconDiv.className = 'site-icon';
        // Используем утилиту из utils.js
        const img = utils.createFaviconImg(site);
        iconDiv.appendChild(img);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'site-title';
        titleSpan.textContent = site.title;

        const siteActions = document.createElement('div');
        siteActions.className = 'site-actions';

        const editButton = document.createElement('button');
        editButton.className = 'site-edit';
        editButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;
        editButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openModal(site);
        });

        const removeButton = document.createElement('button');
        removeButton.className = 'site-remove';
        removeButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        `;
        removeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeSite(site.id);
        });

        siteActions.appendChild(editButton);
        siteActions.appendChild(removeButton);

        tile.appendChild(iconDiv);
        tile.appendChild(titleSpan);
        tile.appendChild(siteActions);

        this.grid.appendChild(tile);
    });
}
}

function setupSearchSuggestions() {
    const searchInput = document.querySelector('.search-input');
    const suggestionsList = document.querySelector('.suggestions');
    let debounceTimeout;
    searchInput.addEventListener('input', () => {
         clearTimeout(debounceTimeout);
         const query = searchInput.value.trim();
         if (query.length < 2) {
              suggestionsList.innerHTML = '';
              return;
         }
         debounceTimeout = setTimeout(() => {
              chrome.history.search({
                  text: query,
                  maxResults: 5
              }, (results) => {
                  suggestionsList.innerHTML = '';
                  results.forEach(item => {
                     const li = document.createElement('li');
                     li.textContent = item.title || item.url;
                     li.addEventListener('click', () => {
                         searchInput.value = item.title || item.url;
                         suggestionsList.innerHTML = '';
                     });
                     suggestionsList.appendChild(li);
                  });
              });
         }, 300);
    });
    document.addEventListener('click', (e) => {
         if (!searchInput.contains(e.target)) {
             suggestionsList.innerHTML = '';
         }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.tabContentManager = new TabContentManager();
        document.querySelector('.search-input').focus();
        const searchInput = document.querySelector('.search-input');
        new ImageSearch(searchInput);
        setupSearchSuggestions();
    }, 100);
});
