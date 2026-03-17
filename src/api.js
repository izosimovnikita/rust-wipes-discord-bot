const { CONFIG, BATTLEMETRICS_API } = require('./config');
const {
    isBlacklisted,
    parseGroupSize,
    parseRate,
    parseDuration,
    parseWipeType,
    passesTimeFilter,
} = require('./helpers');
const cache = require('./cache');

/**
 * Builds the URLSearchParams for the BattleMetrics API request based on filter type.
 */
function buildRequestParams(filterType, filterValue, minPlayers) {
    const params = new URLSearchParams({
        'filter[game]': CONFIG.GAME,
        'filter[maxDistance]': '2000',
        'page[size]': '90',
    });

    if (filterType === 'search') {
        params.append('filter[search]', `"${filterValue}"`);
        params.append('sort', 'details.rust_next_wipe');
    } else {
        let sortField = 'players';
        if (filterType === 'recent') sortField = '-details.rust_last_wipe';
        else if (filterType === 'day' || filterType === null) sortField = 'details.rust_next_wipe';

        params.append('sort', sortField);
        params.append('filter[status]', 'online');
        params.append('filter[search]', '-creative -aim -training -build -pve');
    }

    if (filterType !== 'recent') {
        params.append('filter[players][min]', minPlayers);
    }

    const date = new Date();
    if (filterType === 'recent') {
        date.setHours(date.getHours() - filterValue);
        params.append(`filter[features][${CONFIG.FEATURES.LAST_WIPE_DATE}]`, `${date.toISOString()}:`);
    }
    //  else {
    //     date.setMonth(date.getMonth() - 1);
    // }

    params.append(`filter[features][${CONFIG.FEATURES.PVE_MODE}]`, 'false');
    params.append(`filter[features][${CONFIG.FEATURES.RATE_LIMIT}]`, ':2');

    CONFIG.EXCLUDED_COUNTRIES.forEach((country, i) =>
        params.append(`filter[countries][nor][${i}]`, country)
    );

    return params;
}

/**
 * Fetches up to 5 pages from the BattleMetrics API and returns the raw data array.
 */
async function fetchServerPages(initialUrl) {
    const allData = [];
    let nextUrl = initialUrl;

    for (let page = 0; page < 5; page++) {
        console.log(`📡 Fetching page ${page + 1}: ${nextUrl}`);

        const res = await fetch(nextUrl);
        if (!res.ok) {
            const text = await res.text();
            console.error(`❌ API error on page ${page + 1}: ${res.status}. ${text}`);
            break;
        }

        const json = await res.json();
        if (!json.data || json.data.length === 0) break;

        allData.push(...json.data);
        if (!json.links?.next) break;
        nextUrl = json.links.next;
    }

    return allData;
}

/**
 * Maps a raw BattleMetrics server entry to our internal server object.
 * Returns null if the server should be excluded.
 */
function mapServerEntry(entry, filterType, filterValue, minPlayers) {
    const attr = entry.attributes;
    const details = attr.details || {};
    const settings = details.rust_settings || {};
    const serverName = (attr.name || '').toLowerCase();

    if (filterType !== 'search') {
        if (isBlacklisted(serverName)) return null;
        if (details.rust_description?.toLowerCase().includes('pve only')) return null;
    }

    const lastWipeStr = details.rust_last_wipe;
    const nextWipeStr =
        details.rust_next_wipe || details.rust_next_wipe_map || details.rust_next_wipe_full;

    const targetDate =
        filterType === 'recent' ? new Date(lastWipeStr) : new Date(nextWipeStr);

    if (filterType !== 'search' && (!targetDate || isNaN(targetDate))) return null;

    if (!passesTimeFilter(filterType, filterValue, targetDate, attr.players, minPlayers)) {
        return null;
    }

    return {
        id: entry.id,
        name: attr.name,
        address: attr.address || `${attr.ip}:${attr.port}`,
        players: `${attr.players}/${attr.maxPlayers}`,
        rank: attr.rank ? parseInt(attr.rank) : null,
        timestamp:
            targetDate && !isNaN(targetDate) ? Math.floor(targetDate.getTime() / 1000) : null,
        duration: parseDuration(serverName, lastWipeStr, nextWipeStr),
        mapUrl: details.rust_maps?.url || null,
        groupSize: parseGroupSize(settings),
        rate: parseRate(settings, serverName),
        queue: details.rust_queued_players || 0,
        wipeType: parseWipeType(settings, details, nextWipeStr),
    };
}

/**
 * Filters servers by rank, keeping only those ranked within MAX_RANK.
 * Servers with no rank are excluded.
 */
function filterByRank(servers) {
    return servers.filter(s => s.rank !== null && s.rank <= CONFIG.MAX_RANK);
}

/**
 * Sorts the final server list based on the filter type.
 */
function sortServers(servers, filterType) {
    return [...servers].sort((a, b) => {
        if (filterType === 'recent') return b.timestamp - a.timestamp;
        if (filterType === 'day' || filterType === null) return a.timestamp - b.timestamp;
        const pA = parseInt(a.players.split('/')[0]);
        const pB = parseInt(b.players.split('/')[0]);
        return pB - pA;
    });
}

/**
 * Fetches a URL with automatic retry on 429 (rate limited) responses.
 * Waits for the duration specified in the Retry-After header, or uses
 * exponential backoff if the header is absent.
 */
async function fetchWithRetry(url, maxRetries = 3) {
    let delay = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url);
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : delay;
            console.warn(`⚠️ Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            delay *= 2;
            continue;
        }
        return res;
    }
    return null;
}
/**
 * Fetches monthly player count history for a single server on demand.
 * Returns { avgMonth, peakMonth } or null if unavailable.
 * Results are cached for 10 minutes.
 */
async function fetchServerDetailedStats(serverId) {
    const cacheKey = `stats:${serverId}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const stop = new Date().toISOString();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    const url = `${BATTLEMETRICS_API}/${serverId}/player-count-history?start=${start.toISOString()}&stop=${stop}&resolution=1440`;
    const res = await fetchWithRetry(url);

    if (!res || !res.ok) {
        cache.set(cacheKey, null);
        return null;
    }

    const json = await res.json();
    if (!json.data || json.data.length === 0) {
        cache.set(cacheKey, null);
        return null;
    }

    const dataPoints = json.data.map(p => ({
        avg: p.attributes.value || 0,
        max: p.attributes.max || 0,
    }));
    const peakMonth = Math.max(...dataPoints.map(p => p.max));
    const sumAvg = dataPoints.reduce((acc, p) => acc + p.avg, 0);

    const stats = {
        avgMonth: Math.round(sumAvg / dataPoints.length),
        peakMonth,
    };
    cache.set(cacheKey, stats);
    return stats;
}

/**
 * Main entry point for fetching wipe data.
 * Fetches servers, filters by rank, sorts, and returns the final list.
 */
async function getWipes(filterType = null, filterValue = null, minPlayers = CONFIG.MIN_PLAYERS) {
    try {
        const params = buildRequestParams(filterType, filterValue, minPlayers);
        const rawData = await fetchServerPages(`${BATTLEMETRICS_API}?${params.toString()}`);

        const servers = rawData
            .map(entry => mapServerEntry(entry, filterType, filterValue, minPlayers))
            .filter(Boolean);

        const ranked = filterByRank(servers);

        if (filterType === 'search') return ranked;

        console.log(`✅ Final server list: ${ranked.length} servers.`);
        return sortServers(ranked, filterType);
    } catch (err) {
        console.error(err);
        return [];
    }
}

module.exports = { getWipes, fetchServerDetailedStats };