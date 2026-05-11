const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const CONFIG = {
    GAME: 'rust',
    PAGE_SIZE: 50,
    MIN_PLAYERS: 0,
    MAX_RANK: 500,
    FEATURES: {
        PVE_MODE: '689d22c2-66f4-11ea-8764-e7fb71d2bf20',
        RATE_LIMIT: 'ce84a17f-a52b-11ee-a465-33d2d6d4f5ea',
        LAST_WIPE_DATE: 'ce84a180-a52b-11ee-a465-1bdbafc9d0da',
    },
    EXCLUDED_COUNTRIES: ['UA', 'CN', 'JP', 'US', 'DE', 'PL', 'AU', 'SG'],
    BLACKLIST_KEYWORDS: [
        'creative', 'build', 'aim', 'ukn', 'training', 'test', 'sandbox',
        'bedwars', 'tarkov', 'battleground', 'arena', 'pve', 'funserver',
        'combattag', 'escape', 'minigame', 'lobby', 'tutorial',
    ],
};

const DAYS_MAP = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

const BATTLEMETRICS_API = 'https://api.battlemetrics.com/servers';

module.exports = { TOKEN, CLIENT_ID, CONFIG, DAYS_MAP, BATTLEMETRICS_API };