// Interpreter.js
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export class Interpreter {
  constructor(botConfig) {
    this.botConfig = botConfig;

    const intents = botConfig.settings?.intents?.map(i => `GatewayIntentBits.${i}`).join(', ') || '';

    this.files = {
      // Main file that bootstraps the bot
      "main.js": `
import fs from 'fs';
import path from 'path';
import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import 'dotenv/config';
import { loadCommands, loadEvents } from './utility/deploy.js';

const client = new Client({ intents: [${intents}] });
client.commands = new Collection();

loadCommands(client);
loadEvents(client);

client.once(Events.ClientReady, c => {
  console.log(\`Connecté en tant que \${c.user.tag}\`);
});

client.login(process.env.DISCORD_TOKEN);
`.trim(),

      // Utility functions to load commands and events dynamically
      "utility/deploy.js": `
// utility/deploy.js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const __dirname = path.resolve();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

export async function loadCommands(client) {
  const commands = [];

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      const commandModule = await import(fileUrl);
      const command = commandModule.default || commandModule;

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      } else {
        console.log(\`⚠️ La commande \${filePath} manque la propriété "data" ou "execute".\`);
      }
    }
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    console.log(\`🔄️ En train de préparer \${commands.length} commandes.\`);
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log(\`✅ \${data.length} commandes ont été chargées.\`);
  } catch (error) {
    console.error(error);
  }
}

export async function loadEvents(client) {
  console.log('🔄️ En train de charger les événements...');
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const fileUrl = pathToFileURL(filePath).href;

    const eventModule = await import(fileUrl);
    const event = eventModule.default || eventModule;

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
  console.log('✅ Événements chargés avec succès.');
}
      `.trim(),

      // Event triggered when bot is ready
      "events/clientReady.js": `
import { Events } from 'discord.js';

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(\`Ready! Logged in as \${client.user.tag}\`);
  },
};
      `.trim(),

      // Handles slash command interactions
      "events/interactionCreate.js": `
import { Events, MessageFlags } from 'discord.js';

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(\`No command matching \${interaction.commandName} was found.\`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Il y a eu une erreur en exécutant cette commande!', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Il y a eu une erreur en exécutant cette commande!', flags: MessageFlags.Ephemeral });
      }
    }
  },
};
      `.trim(),

      // Environment variables for bot authentication
      ".env": `DISCORD_TOKEN=${botConfig.auth?.token || 'YOUR_TOKEN'}
DISCORD_CLIENT_ID=${botConfig.auth?.clientId || 'YOUR_CLIENT_ID'}`,

      // NodeJS project info and dependencies
      "package.json": JSON.stringify({
        name: this.sanitizeProjectName(botConfig.meta?.name) || "discord-bot",
        version: botConfig.meta?.version || "1.0.0",
        description: botConfig.meta?.description || "Generated bot",
        type: "module",
        main: "main.js",
        scripts: {
          start: "node main.js"
        },
        dependencies: {
          "discord.js": "latest",
          "dotenv": "^16.3.1"
        }
      }, null, 2)
    };
  }

  sanitizeProjectName(name) {
    if (!name || typeof name !== 'string') return 'discord-bot';
  
    return name
      .normalize('NFD')                  // Decompose accented chars (é → e + ´)
      .replace(/[\u0300-\u036f]/g, '')  // Remove accent marks
      .trim()                           // Trim whitespace from ends
      .toLowerCase()                    // Lowercase all letters
      .replace(/\s+/g, '-')             // Replace spaces (and runs of spaces) with single dash
      .replace(/[^a-z0-9\-]/g, '')     // Remove all chars except letters, digits, and dash
      .replace(/\-+/g, '-')             // Replace multiple dashes with single dash
      .replace(/^\-+|\-+$/g, '');      // Remove leading and trailing dashes
  }  

  generateFiles() {
    return this.files;
  }

  async downloadZip() {
    const zip = new JSZip();
    const files = this.generateFiles();

    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const zipName = `${this.sanitizeProjectName(this.botConfig.meta?.name) || "discord-bot"}.zip`;
    saveAs(blob, zipName);
  }

  preview(file = "main.js", elementId = "preview") {
    const content = this.files[file];
    const previewEl = document.getElementById(elementId);
    if (!content) {
      console.error(`❌ File "${file}" not found.`);
      return;
    }
    if (!previewEl) {
      console.warn(`⚠️ Element #${elementId} not found for preview.`);
      return;
    }
    previewEl.textContent = content;
  }
}