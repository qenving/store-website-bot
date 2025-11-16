import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../core/config/config';
import { dal } from '../core/db/dal';
import { createLogger } from '../core/logging/logger';
import { adminController } from '../core/admin/AdminController';
import { uptimeService } from '../core/monitoring/uptimeService';

const logger = createLogger({ module: 'DiscordBot' });

interface Command {
  data: {
    name: string;
    toJSON(): any;
  };
  execute: (interaction: any) => Promise<void>;
}

export async function startDiscordBot(): Promise<void> {
  const config = getConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  }) as Client & { commands: Collection<string, Command> };

  client.commands = new Collection();

  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
    } else {
      logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
    }
  }

  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = await import(filePath);

    if ('name' in event && 'execute' in event) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      logger.info(`Loaded event: ${event.name}`);
    } else {
      logger.warn(`Event at ${filePath} is missing required "name" or "execute" property`);
    }
  }

  await dal.initialize();

  await registerCommands(client, config.discord.token, config.discord.clientId, config.discord.guildId);

  await client.login(config.discord.token);

  client.once('ready', () => {
    adminController.registerBotClient(client);

    // Register bot uptime tracking
    uptimeService.registerService('bot');
    logger.info('Bot uptime tracking started');
  });

  logger.info('Discord bot started');
}

async function registerCommands(
  client: Client & { commands: Collection<string, Command> },
  token: string,
  clientId: string,
  guildId?: string
): Promise<void> {
  const commands = [];

  for (const command of client.commands.values()) {
    commands.push(command.data.toJSON());
  }

  const rest = new REST().setToken(token);

  try {
    logger.info(`Registering ${commands.length} slash commands...`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      logger.info(`Successfully registered ${commands.length} guild commands for guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info(`Successfully registered ${commands.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to register commands', error);
    throw error;
  }
}
