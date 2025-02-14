const utils = (function() {
    const metadataCache = new Map();

async function getSiteMetadata(url) {
    // Пытаемся получить кэш из chrome.storage.local
    const storageData = await chrome.storage.local.get('metadataCache');
    const cache = storageData.metadataCache || {};
    const cached = cache[url];
    const now = Date.now();
    const ttl = 24 * 60 * 60 * 1000; // 24 часа
    if (cached && now - cached.timestamp < ttl) {
        return cached.data;
    }
    
    // Если кэша нет, выполняем существующую логику получения метаданных
    try {
        const historyItems = await chrome.history.search({
            text: url,
            startTime: 0,
            maxResults: 1
        });
        if (historyItems.length > 0 && historyItems[0].title) {
            const data = { title: historyItems[0].title, source: 'history' };
            cache[url] = { data, timestamp: now };
            await chrome.storage.local.set({ metadataCache: cache });
            return data;
        }
        try {
            await fetch(url, { 
                method: 'HEAD',
                mode: 'no-cors',
                signal: AbortSignal.timeout(3000)
            });
            try {
                const metadata = await fetchTitleSafely(url);
                if (metadata.title) {
                    cache[url] = { data: metadata, timestamp: now };
                    await chrome.storage.local.set({ metadataCache: cache });
                    return metadata;
                }
            } catch (fetchError) {
                console.warn('Safe fetch failed:', fetchError);
                const fallback = { title: new URL(url).hostname, source: 'hostname' };
                cache[url] = { data: fallback, timestamp: now };
                await chrome.storage.local.set({ metadataCache: cache });
                return fallback;
            }
        } catch (noCorsError) {
            console.warn('No-cors request failed:', noCorsError);
            throw new Error('Сайт недоступен. Проверьте соединение или попробуйте позже.');
        }
    } catch (error) {
        console.warn('Metadata fetch failed:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Не удалось подключиться к сайту. Проверьте правильность адреса.');
        }
        throw error;
    }
}

    async function fetchTitleSafely(url) {
        const noCorsResponse = await fetch(url, {
            mode: 'no-cors',
            signal: AbortSignal.timeout(5000),
            headers: {
                'Accept': 'text/html'
            }
        });
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(5000),
                headers: {
                    'Accept': 'text/html',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate'
                }
            });
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            
            doc.querySelectorAll('script, link[rel="stylesheet"], link[rel="preload"]').forEach(el => el.remove());
            
            const title = doc.querySelector('title')?.textContent?.trim() ||
                         doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
            
            if (title) {
                return { title, source: 'fetch' };
            }
        } catch (error) {
            console.warn('Content fetch failed:', error);
        }
        return { title: new URL(url).hostname, source: 'hostname' };
    }

    function formatUrl(url) {
        if (!url) return '';
        url = url.trim().toLowerCase();
        if (!url.includes('://') && !url.startsWith('//')) {
            url = 'https://' + url;
        }
        try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes('.')) {
                throw new Error('Неверный формат домена');
            }
            return urlObj.href;
        } catch (e) {
            throw new Error('Неверный URL или имя домена');
        }
    }
    
    // Универсальная функция создания favicon
function createFaviconImg(site) {
    const base = new URL(site.url).origin;
    const candidates = [
        base + '/favicon.ico',
        base + '/favicon.png',
        base + '/favicon.svg',
        base + '/apple-touch-icon.png'
    ];
    let candidateIndex = 0;
    const googleUrl = "https://www.google.com/s2/favicons?sz=64&domain_url=" + encodeURIComponent(site.url);
    const img = document.createElement('img');
    img.alt = site.title;
    img.onerror = function() {
        candidateIndex++;
        if (candidateIndex < candidates.length) {
            img.src = candidates[candidateIndex];
        } else if (!img.dataset.googleAttempted) {
            // Пытаемся через Google API
            img.dataset.googleAttempted = "true";
            img.src = googleUrl;
        } else {
            // Если и Google API возвращает дефолтную иконку (не очень эстетично) – заменяем на fallback-букву
            const fallback = document.createElement('span');
            fallback.className = 'fallback-letter';
            fallback.textContent = site.title.charAt(0).toUpperCase();
            // Заменяем родительский элемент содержимым fallback
            if (img.parentElement) {
                img.parentElement.innerHTML = '';
                img.parentElement.appendChild(fallback);
            }
        }
    };
    img.src = candidates[candidateIndex];
    return img;
}
    return { formatUrl, getSiteMetadata, createFaviconImg };
})();
