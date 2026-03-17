const { CONFIG, DAYS_MAP } = require('./config');

/**
 * Determines whether a server name contains any blacklisted keywords.
 */
function isBlacklisted(serverName) {
    return CONFIG.BLACKLIST_KEYWORDS.some(word => serverName.includes(word));
}

/**
 * Parses the group/team size from server settings.
 * Returns 'No Limit' for very large limits, the number as string, or 'Unknown'.
 */
function parseGroupSize(settings) {
    const teamLimit = settings?.teamUILimit;
    if (teamLimit === undefined) return 'Unknown';
    return teamLimit > 16 ? 'No Limit' : teamLimit.toString();
}

/**
 * Parses the gather rate from server settings or falls back to the server name.
 */
function parseRate(settings, serverName) {
    let rate = settings?.rates?.gather || 1;
    if (rate === 1) {
        const match = serverName.match(/([0-9]+)x/);
        if (match) rate = match[1];
    }
    return `${rate}X`;
}

/**
 * Infers the wipe duration (Weekly / Biweekly / Monthly) from the server name
 * or by calculating the gap between last and next wipe dates.
 */
function parseDuration(serverName, lastWipeStr, nextWipeStr) {
    if (serverName.includes('monthly') || serverName.includes('month')) return 'Monthly';
    if (serverName.includes('biweekly') || serverName.includes('2 week')) return 'Biweekly';
    if (serverName.includes('weekly') || serverName.includes('1 week')) return 'Weekly';

    if (lastWipeStr && nextWipeStr) {
        const diffDays = Math.round(
            (new Date(nextWipeStr) - new Date(lastWipeStr)) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 9) return 'Weekly';
        if (diffDays >= 10 && diffDays <= 18) return 'Biweekly';
        if (diffDays >= 25) return 'Monthly';
    }

    return 'Unknown';
}

/**
 * Determines the wipe type label (Map Wipe / FORCE WIPE / FULL WIPE (BPs))
 * from server settings, the next wipe date, and rust detail flags.
 */
function parseWipeType(settings, details, nextWipeStr) {
    let wipeLabel = 'Map Wipe';

    if (settings.forceWipeType) {
        const type = settings.forceWipeType.toLowerCase();
        if (type.includes('full') || type.includes('bp')) wipeLabel = 'FULL WIPE (BPs)';
        else if (type.includes('force')) wipeLabel = 'FORCE WIPE';
        else if (type.includes('map')) wipeLabel = 'Map Wipe';
    } else if (nextWipeStr) {
        const nextDate = new Date(nextWipeStr);
        const day = nextDate.getUTCDate();
        const weekDay = nextDate.getUTCDay();
        if (weekDay === 4 && day <= 7) {
            wipeLabel = 'FORCE WIPE';
        }
    }

    if (wipeLabel !== 'FULL WIPE (BPs)' && (details.rust_full_wipe === true || settings.fullWipe === true)) {
        wipeLabel = 'FULL WIPE (BPs)';
    }

    return wipeLabel;
}

/**
 * Checks whether a server passes the time-based filter for a given filter type.
 * Returns false if the server should be excluded.
 */
function passesTimeFilter(filterType, filterValue, targetDate, players, minPlayers) {
    const now = new Date();

    if (filterType === 'recent') {
        const hoursAgo = new Date(now.getTime() - filterValue * 60 * 60 * 1000);
        if (targetDate < hoursAgo || targetDate > now) return false;
        if (players < minPlayers) return false;
    } else if (filterType === 'day') {
        if (targetDate.getUTCDay() !== DAYS_MAP[filterValue.toLowerCase()]) return false;
    } else if (filterType === null) {
        const weekLater = new Date();
        weekLater.setDate(now.getDate() + 7);
        if (targetDate < now || targetDate > weekLater) return false;
    }

    return true;
}

module.exports = {
    isBlacklisted,
    parseGroupSize,
    parseRate,
    parseDuration,
    parseWipeType,
    passesTimeFilter,
};