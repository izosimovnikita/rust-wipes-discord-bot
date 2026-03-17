const {
    SlashCommandBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
} = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('wipes')
        .setDescription('Rust wipes info')
        .setIntegrationTypes([
            ApplicationIntegrationType.GuildInstall,
            ApplicationIntegrationType.UserInstall,
        ])
        .setContexts([
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
        ])
        .addStringOption(opt =>
            opt.setName('search').setDescription('Search by server name (e.g. Magic Rust)')
        )
        .addIntegerOption(opt =>
            opt
                .setName('players')
                .setDescription('Minimum active players (e.g. 100)')
                .setMinValue(1)
        )
        .addStringOption(opt =>
            opt
                .setName('day')
                .setDescription('Choose a day of the week')
                .setAutocomplete(true)
        )
        .addIntegerOption(opt =>
            opt
                .setName('recent')
                .setDescription('Show servers wiped in the last N hours (e.g. 3)')
                .setMinValue(1)
                .setMaxValue(168)
        ),
].map(c => c.toJSON());

module.exports = { commands };