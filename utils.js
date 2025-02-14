const utils = (function() {
    async function getSiteMetadata(url) {
        try {
            // First try to get title from browser history
            const historyItems = await chrome.history.search({
                text: url,
                startTime: 0,
                maxResults: 1
            });

            if (historyItems.length > 0 && historyItems[0].title) {
                return { title: historyItems[0].title, source: 'history' };
            }

            // Try no-cors HEAD request first
            try {
                const noCorsResponse = await fetch(url, { 
                    method: 'HEAD',
                    mode: 'no-cors',
                    signal: AbortSignal.timeout(3000)
                });

                // If we got here, the site exists and responds
                // Now try to get the title safely
                try {
                    const metadata = await fetchTitleSafely(url);
                    if (metadata.title) {
                        return metadata;
                    }
                } catch (fetchError) {
                    console.warn('Safe fetch failed:', fetchError);
                    // If safe fetch fails, we already know the site exists from no-cors request
                    // So just use the hostname
                    return { title: new URL(url).hostname, source: 'hostname' };
                }
            } catch (noCorsError) {
                // If even no-cors fails, the site might be down or unreachable
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
        // First try no-cors GET
        const noCorsResponse = await fetch(url, {
            mode: 'no-cors',
            signal: AbortSignal.timeout(5000),
            headers: {
                'Accept': 'text/html'
            }
        });

        // If no-cors succeeded, try normal fetch for content
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
            
            // Remove all scripts before parsing
            doc.querySelectorAll('script, link[rel="stylesheet"]').forEach(el => el.remove());
            
            const title = doc.querySelector('title')?.textContent?.trim() ||
                         doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
            
            if (title) {
                return { title, source: 'fetch' };
            }
        } catch (error) {
            console.warn('Content fetch failed:', error);
        }

        // If we couldn't get the title, but know the site exists (from no-cors)
        return { title: new URL(url).hostname, source: 'hostname' };
    }

    function formatUrl(url) {
        if (!url) return '';

        url = url.trim().toLowerCase();

        // Handle common URL patterns
        if (!url.includes('://') && !url.startsWith('//')) {
            url = 'https://' + url;
        }

        try {
            const urlObj = new URL(url);
            // Validate basic URL structure
            if (!urlObj.hostname.includes('.')) {
                throw new Error('Неверный формат домена');
            }
            return urlObj.href;
        } catch (e) {
            throw new Error('Неверный URL или имя домена');
        }
    }

    return { formatUrl, getSiteMetadata };
})();