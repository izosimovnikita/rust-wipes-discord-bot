const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

const { TOKEN, CLIENT_ID } = require('./config');
const { commands } = require('./commands');
const { handleWipesCommand, handleAutocomplete } = require('./handlers/wipes');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', () => {
    console.log(`✅ Bot is online: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'wipes') {
            await handleAutocomplete(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'wipes') {
        await handleWipesCommand(interaction);
    }
});

async function startBot() {
    try {
        console.log('--- Bot initialization ---');

        console.log('1. Registering slash commands with Discord...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands registered successfully!');

        console.log('2. Connecting to Discord Gateway...');
        await client.login(TOKEN);
    } catch (error) {
        console.error('❌ CRITICAL ERROR DURING STARTUP:');
        console.error(error);
        process.exit(1);
    }
}

startBot();