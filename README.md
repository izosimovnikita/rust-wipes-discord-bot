_In Development_
# Rust Wipe Tracker — Discord Bot

A Discord bot that fetches and displays upcoming and recent **Rust server wipe schedules** using the BattleMetrics API. Users can search for servers by name, filter by day of the week, find recently wiped servers, or set a minimum player count — all from a single `/wipes` slash command with paginated, sortable results and an interactive server detail lookup.

---

## How to Run

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- A Discord bot application with a valid token ([create one here](https://discord.com/developers/applications))

### Steps

1. **Clone or download** the project files into a folder.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set your credentials** in `src/config.js`:
   ```js
   const TOKEN = 'your-bot-token-here';
   const CLIENT_ID = 'your-client-id-here';
   ```

4. **Start the bot:**
   ```bash
   node src/index.js
   ```

   On first startup the bot will automatically register all slash commands with Discord, then connect to the gateway. You should see:
   ```
   ✅ Commands registered successfully!
   ✅ Bot is online: YourBot#1234
   ```

5. **Invite the bot** to your server using the OAuth2 URL from the Discord Developer Portal. Make sure to grant the `applications.commands` and `bot` scopes.

---

## Bot Commands

### `/wipes`
Fetches a list of Rust servers with upcoming or recent wipes, filtered by your chosen criteria. Results are shown 5 servers per page with navigation, sorting buttons, and a server detail dropdown.

All options are optional and can be combined (e.g. `/wipes day:friday players:50`).

| Option | Type | Description |
|---|---|---|
| `search` | text | Search by server name. Example: `Magic Rust` |
| `day` | text | Show servers wiping on a specific day of the week. Supports autocomplete. Example: `friday` |
| `recent` | number (1–168) | Show servers that wiped in the last N hours. Example: `3` |
| `players` | number (min 1) | Only show servers with at least this many active players. Example: `100` |

**Each server card displays:**
- Wipe type (🔴 Force Wipe / 🟡 Full Wipe / 🔵 Map Wipe), wipe cycle, gather rate, group size
- Current player count, queue size, and BattleMetrics rank
- Wipe date and time (absolute + relative)
- Map link and `connect` command

**Interactive controls on each result page:**

| Control | Action |
|---|---|
| ⬅️ / ➡️ | Navigate between pages |
| Sort by Time | Sort by wipe time (soonest or most recent first) |
| Sort by Players | Sort by current player count (highest first) |
| Server dropdown | Select a server to view its detailed stats in a private message |

**Server detail popup** (ephemeral — visible only to you):
When you pick a server from the dropdown, the bot fetches and shows:
wipe type, cycle, rate, group size, player count, rank, **monthly average online**, and **monthly peak online**.
Stats are cached for 10 minutes so repeated lookups are instant.

Results expire after **2 minutes** of inactivity, after which all controls are automatically removed.

---

## Server Filtering

The bot applies the following filters to all results from BattleMetrics:

- **Game:** Rust only
- **Rank:** Top 600 globally (BattleMetrics rank ≤ 600)
- **Distance:** Maximum 2000 km from the API reference point
- **PvE mode:** Excluded
- **Gather rate:** Vanilla and up to 2x only
- **Countries excluded:** UA, CN, JP, US, PL, AU, SG
- **Blacklisted keywords in server name:** `creative`, `build`, `aim`, `ukn`, `training`, `test`, `sandbox`, `bedwars`, `tarkov`, `battleground`, `arena`, `pve`, `funserver`, `combattag`, `escape`, `minigame`, `lobby`, `tutorial`

---

## File Overview

### `src/index.js`
Entry point of the bot. Creates the Discord client, registers event listeners (`ready`, `interactionCreate`), and starts the bot by registering slash commands and logging in via `client.login()`.

### `src/config.js`
Central configuration file. Contains the bot token, client ID, and the `CONFIG` object with all tunable settings: game name, minimum player count, maximum rank threshold (`MAX_RANK: 500`), BattleMetrics feature flag IDs, excluded countries, and blacklisted server name keywords. Also defines `DAYS_MAP` for day-of-week filtering and the base BattleMetrics API URL.

### `src/commands.js`
Defines the `/wipes` slash command using Discord's `SlashCommandBuilder`. Declares all options (`search`, `players`, `day`, `recent`) and sets the command's supported integration types and interaction contexts. Exports the command list as JSON for registration with the Discord REST API.

### `src/api.js`
Handles all communication with the BattleMetrics API. Key functions:
- **`buildRequestParams`** — constructs query parameters based on the active filter type, including rank, distance, PvE, rate, country, and wipe-date filters
- **`fetchServerPages`** — paginates through up to 5 pages of API results
- **`mapServerEntry`** — transforms a raw API server object into the internal format, applying blacklist and time-based filters; extracts rank, wipe type, rate, group size, and map URL
- **`filterByRank`** — keeps only servers with a BattleMetrics rank ≤ `MAX_RANK` (500)
- **`fetchWithRetry`** — fetches a URL with automatic retry on 429 rate-limit responses, respecting the `Retry-After` header with exponential backoff fallback
- **`fetchServerDetailedStats`** — fetches monthly player count history for a single server on demand; returns `{ avgMonth, peakMonth }` and caches the result for 10 minutes
- **`getWipes`** — main export; orchestrates the full fetch → map → rank filter → sort pipeline

### `src/cache.js`
Lightweight in-memory key/value cache with a configurable TTL (default: 10 minutes). Used by `api.js` to cache per-server player history stats so repeated detail lookups are served instantly without hitting the API again.

### `src/helpers.js`
Pure utility functions with no side effects or API calls. Used by `api.js` to keep the mapping logic clean:
- **`isBlacklisted`** — checks whether a server name contains any blacklisted keyword
- **`parseGroupSize`** — extracts team/group size limit from server settings
- **`parseRate`** — determines the gather rate (e.g. `2X`) from settings or the server name
- **`parseDuration`** — infers the wipe cycle (Weekly / Biweekly / Monthly) from the server name or the gap between last and next wipe dates
- **`parseWipeType`** — determines the wipe label (Map Wipe / FORCE WIPE / FULL WIPE (BPs)) from settings, dates, and detail flags
- **`passesTimeFilter`** — validates whether a server's wipe date falls within the requested time window

### `src/handlers/wipes.js`
Contains all Discord UI logic for the `/wipes` command. Separated from data fetching to keep responsibilities clear:
- **`resolveFilter`** — reads interaction options and returns a `{ type, value }` filter descriptor
- **`formatServerEntry`** — formats a single server into a styled embed block with emoji numbering, colored wipe type badge, rank, and connect command
- **`resolveEmbedColor`** — picks the embed accent color based on the dominant wipe type on the current page
- **`buildMessage`** — assembles the full embed plus three component rows: navigation buttons, sort buttons, and the server select dropdown
- **`buildServerDetailEmbed`** — builds the detailed stats embed shown ephemerally when a user picks a server from the dropdown
- **`applySort`** — sorts the server list in place by time or player count
- **`handleAutocomplete`** — responds to Discord autocomplete requests for the `day` option
- **`handleWipesCommand`** — orchestrates the full command flow: fetch data, send first page, and handle all button and select menu interactions via a single collector
