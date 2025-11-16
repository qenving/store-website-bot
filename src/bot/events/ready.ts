import { Client } from 'discord.js';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'BotReady' });

export const name = 'ready';
export const once = true;

export async function execute(client: Client): Promise<void> {
  if (!client.user) {
    logger.error('Client user is null');
    return;
  }

  logger.info(`Discord bot ready! Logged in as ${client.user.tag}`);
  logger.info(`Bot is in ${client.guilds.cache.size} guilds`);

  client.user.setPresence({
    activities: [
      {
        name: '/buy | Store Bot',
        type: 0
      }
    ],
    status: 'online'
  });

  logger.info('Bot presence set');
}
