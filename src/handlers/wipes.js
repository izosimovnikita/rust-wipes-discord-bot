const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const { DAYS_MAP, CONFIG } = require('../config');
const { getWipes, fetchServerDetailedStats } = require('../api');

const PER_PAGE = 5;

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const WIPE_TYPE_STYLE = {
    'FORCE WIPE':      { emoji: '🔴', color: '#FF6B35' },
    'FULL WIPE (BPs)': { emoji: '🟡', color: '#FFD700' },
    'Map Wipe':        { emoji: '🔵', color: '#4287f5' },
};

function getNumberDisplay(n) {
    return n <= NUMBER_EMOJIS.length ? NUMBER_EMOJIS[n - 1] : `**#${n}**`;
}

/**
 * Picks an embed color based on the most common wipe type on the current page.
 */
function resolveEmbedColor(pageServers) {
    const counts = {};
    for (const s of pageServers) {
        counts[s.wipeType] = (counts[s.wipeType] || 0) + 1;
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return WIPE_TYPE_STYLE[dominant]?.color ?? '#ce422b';
}

/**
 * Resolves the filter type and value from the Discord interaction options.
 */
function resolveFilter(interaction) {
    const searchVal = interaction.options.getString('search');
    const playersVal = interaction.options.getInteger('players');
    const recentHours = interaction.options.getInteger('recent');
    const dayVal = interaction.options.getString('day');

    if (searchVal) return { type: 'search', value: searchVal };
    if (recentHours) return { type: 'recent', value: recentHours };
    if (dayVal && DAYS_MAP[dayVal.toLowerCase()] !== undefined) return { type: 'day', value: dayVal };
    if (playersVal) return { type: 'players_search', value: playersVal };

    return { type: null, value: null };
}

/**
 * Builds a single server entry string for the embed description.
 */
function formatServerEntry(server, index) {
    const style = WIPE_TYPE_STYLE[server.wipeType] ?? { emoji: '⚪' };
    const num = getNumberDisplay(index + 1);
    const name = server.name.substring(0, 60).toUpperCase();
    const queueDisplay = server.queue > 0 ? ` **(+${server.queue} queue)**` : '';
    const timeString = `<t:${server.timestamp}:f> (<t:${server.timestamp}:R>)`;
    const rankDisplay = server.rank ? `🏆 Rank **#${server.rank}**` : '';
    const connectLine = server.mapUrl
        ? `> 🗺️ [View Map](${server.mapUrl})  ·  \`connect ${server.address}\``
        : `> \`connect ${server.address}\``;
    let entry = `${num} **${name}**\n`;
    entry += `> ${style.emoji} **${server.wipeType}** · 🗓️ ${server.duration} · 📈 ${server.rate} · ⚔️ ${server.groupSize}\n`;
    entry += `> 👥 \`${server.players}\`${queueDisplay}${rankDisplay ? `  ·  ${rankDisplay}` : ''}\n`;
    entry += `> 🕒 ${timeString}\n`;
    entry += connectLine;

    return entry;
}

/**
 * Builds the embed and all component rows for a given page and sort state.
 */
function buildMessage(allServers, page, currentSort) {
    const totalPages = Math.ceil(allServers.length / PER_PAGE);
    const start = page * PER_PAGE;
    const pageServers = allServers.slice(start, start + PER_PAGE);

    const embed = new EmbedBuilder()
        .setTitle(`🔥 RUST SERVER WIPES — ${allServers.length} FOUND`)
        .setColor(resolveEmbedColor(pageServers))
        .setDescription(
            pageServers
                .map((server, i) => formatServerEntry(server, start + i))
                .join('\n\n\n')
        )
        .setFooter({
            text: `Page ${page + 1} of ${totalPages}  ·  Sorted by: ${currentSort === 'time' ? 'Time' : 'Players'}`,
        });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('next')
            .setLabel('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1)
    );

    const sortRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sort_time')
            .setLabel('Sort by Time')
            .setStyle(currentSort === 'time' ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('sort_players')
            .setLabel('Sort by Players')
            .setStyle(currentSort === 'players' ? ButtonStyle.Success : ButtonStyle.Primary)
    );

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('server_select')
            .setPlaceholder('📊 Select a server for detailed stats...')
            .addOptions(
                pageServers.map((server, i) => ({
                    label: server.name.substring(0, 100),
                    value: server.id,
                    description: `Rank #${server.rank ?? '—'} · ${server.players} players`,
                    emoji: WIPE_TYPE_STYLE[server.wipeType]?.emoji ?? '⚪',
                }))
            )
    );
    return { embeds: [embed], components: [navRow, sortRow, selectRow] };
}

/**
 * Applies a sort to the server list in place based on the given sort key and filter type.
 */
function applySort(allServers, sortKey, filterType) {
    if (sortKey === 'time') {
        allServers.sort((a, b) =>
            filterType === 'recent' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
        );
    } else if (sortKey === 'players') {
        allServers.sort((a, b) => {
            const pA = parseInt(a.players.split('/')[0]) + (a.queue || 0);
            const pB = parseInt(b.players.split('/')[0]) + (b.queue || 0);
            return pB - pA;
        });
    }
}

/**
 * Builds the ephemeral embed shown when a user selects a server from the dropdown.
 */
function buildServerDetailEmbed(server, stats) {
    const style = WIPE_TYPE_STYLE[server.wipeType] ?? { color: '#ce422b' };
    return new EmbedBuilder()
        .setTitle(server.name)
        .setColor(style.color)
        .addFields(
            { name: '🛠️ Wipe Type',     value: server.wipeType,   inline: true },
            { name: '🗓️ Cycle',          value: server.duration,   inline: true },
            { name: '📈 Rate',           value: server.rate,       inline: true },
            { name: '⚔️ Group Size',     value: server.groupSize,  inline: true },
            { name: '👥 Players',        value: server.players,    inline: true },
            { name: '🏆 Rank',           value: server.rank ? `#${server.rank}` : '—', inline: true },
            { name: '📊 Monthly Avg',    value: stats ? `${stats.avgMonth}` : 'N/A', inline: true },
            { name: '📊 Monthly Peak',   value: stats ? `${stats.peakMonth}` : 'N/A', inline: true },
        )
        .setFooter({ text: `connect ${server.address}` });
}

/**
 * Handles autocomplete for the 'day' option.
 */
async function handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'day') return;

    const input = focused.value.toLowerCase();
    const matches = Object.keys(DAYS_MAP)
        .filter(day => day.startsWith(input))
        .slice(0, 25)
        .map(day => ({
            name: day.charAt(0).toUpperCase() + day.slice(1),
            value: day,
        }));

    await interaction.respond(matches);
}

/**
 * Handles the /wipes slash command end-to-end:
 * fetches servers, sends the first page, and manages pagination/sort/detail collectors.
 */
async function handleWipesCommand(interaction) {
    await interaction.deferReply();

    const playersVal = interaction.options.getInteger('players');
    const minPlayers = playersVal !== null ? playersVal : CONFIG.MIN_PLAYERS;
    const { type, value } = resolveFilter(interaction);

    const allServers = await getWipes(type, value, minPlayers);
    if (allServers.length === 0) {
        return interaction.editReply('No wipes found for your criteria.');
    }

    let currentPage = 0;
    let currentSort = 'time';

    const response = await interaction.editReply(buildMessage(allServers, currentPage, currentSort));
    const collector = response.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Not yours!', flags: [64] });
        }
        collector.resetTimer();

        if (i.customId === 'prev') {
            currentPage--;
            await i.update(buildMessage(allServers, currentPage, currentSort));
        } else if (i.customId === 'next') {
            currentPage++;
            await i.update(buildMessage(allServers, currentPage, currentSort));
        } else if (i.customId === 'sort_time') {
            currentSort = 'time';
            currentPage = 0;
            applySort(allServers, 'time', type);
            await i.update(buildMessage(allServers, currentPage, currentSort));
        } else if (i.customId === 'sort_players') {
            currentSort = 'players';
            currentPage = 0;
            applySort(allServers, 'players', type);
            await i.update(buildMessage(allServers, currentPage, currentSort));
        } else if (i.customId === 'server_select') {
            await i.deferUpdate();
            const server = allServers.find(s => s.id === i.values[0]);
            if (!server) return;
            const stats = await fetchServerDetailedStats(server.id);
            await i.followUp({
                embeds: [buildServerDetailEmbed(server, stats)],
                ephemeral: true,
            });
            // Reset the select menu back to placeholder
            await i.editReply(buildMessage(allServers, currentPage, currentSort));
        }
    });

    collector.on('end', (_collected, reason) => {
        if (reason === 'time') {
            interaction.editReply({ components: [] }).catch(() => {});
        }
    });
}

module.exports = { handleWipesCommand, handleAutocomplete };