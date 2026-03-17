# Rust Wipe Tracker — Discord Bot

A Discord bot that fetches and displays upcoming and recent **Rust server wipe schedules** using the BattleMetrics API. Users can search for servers by name, filter by day of the week, find recently wiped servers, or set a minimum player count — all from a single `/wipes` slash command with paginated results and sortable output.

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
Fetches a list of Rust servers with upcoming or recent wipes, filtered by your chosen criteria. Results are shown 5 servers per page with navigation and sorting buttons.

All options are optional and can be combined (e.g. `/wipes day:friday players:50`).

| Option | Type | Description |
|---|---|---|
| `search` | text | Search by server name. Example: `Magic Rust` |
| `day` | text | Show servers wiping on a specific day of the week. Supports autocomplete. Example: `friday` |
| `recent` | number (1–168) | Show servers that wiped in the last N hours. Example: `3` |
| `players` | number (min 1) | Only show servers with at least this many active players. Example: `100` |

**Interactive buttons available on each result:**

| Button | Action |
|---|---|
| ⬅️ / ➡️ | Navigate between pages |
| Sort by Time | Sort results by wipe time (soonest or most recent first) |
| Sort by Players | Sort results by current player count (highest first) |

Results expire after **2 minutes** of inactivity, after which the buttons are automatically removed.

---

## File Overview

### `src/index.js`
Entry point of the bot. Creates the Discord client, registers event listeners (`ready`, `interactionCreate`), and starts the bot by registering slash commands and logging in via `client.login()`.

### `src/config.js`
Central configuration file. Contains the bot token, client ID, and the `CONFIG` object with all tunable settings: game name, player thresholds, peak filter, BattleMetrics feature flag IDs, excluded countries, and blacklisted server name keywords. Also defines the `DAYS_MAP` used for day-of-week filtering and the base BattleMetrics API URL.

### `src/commands.js`
Defines the `/wipes` slash command using Discord's `SlashCommandBuilder`. Declares all options (`search`, `players`, `day`, `recent`) and sets the command's supported integration types and interaction contexts. Exports the command list as JSON for registration with the Discord REST API.

### `src/api.js`
Handles all communication with the BattleMetrics API. Contains four focused functions:
- **`buildRequestParams`** — constructs query parameters based on the active filter type
- **`fetchServerPages`** — paginates through up to 5 pages of API results
- **`mapServerEntry`** — transforms a raw API server object into the internal format, applying blacklist and time-based filters
- **`filterAndAttachStats`** — fetches player count history for each server in batches, filters out servers below the peak player threshold, and attaches `avgMonth` / `peakMonth` stats
- **`getWipes`** — the main export; orchestrates the full fetch → filter → enrich → sort pipeline

### `src/helpers.js`
Pure utility functions with no side effects or API calls. Used by `api.js` to keep the mapping logic readable:
- **`isBlacklisted`** — checks whether a server name contains any blacklisted keyword
- **`parseGroupSize`** — extracts team/group size limit from server settings
- **`parseRate`** — determines the gather rate (e.g. `2X`) from settings or the server name
- **`parseDuration`** — infers the wipe cycle (Weekly / Biweekly / Monthly) from the server name or the gap between last and next wipe dates
- **`parseWipeType`** — determines the wipe label (Map Wipe / FORCE WIPE / FULL WIPE (BPs)) from settings, dates, and detail flags
- **`passesTimeFilter`** — validates whether a server's wipe date falls within the requested time window

### `src/handlers/wipes.js`
Contains all Discord UI logic for the `/wipes` command. Separated from data fetching to keep responsibilities clear:
- **`resolveFilter`** — reads interaction options and returns a `{ type, value }` filter descriptor
- **`formatServerEntry`** — formats a single server into a markdown embed block
- **`buildMessage`** — assembles the full embed and navigation/sort button rows for a given page
- **`applySort`** — sorts the server list in place by time or player count
- **`handleAutocomplete`** — responds to Discord autocomplete requests for the `day` option
- **`handleWipesCommand`** — orchestrates the full command flow: fetch data, send first page, collect button interactions, update on navigation or sort