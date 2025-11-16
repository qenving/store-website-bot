import { Interaction, Collection } from 'discord.js';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'InteractionCreate' });

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const client = interaction.client as any;
  const command = client.commands?.get(interaction.commandName);

  if (!command) {
    logger.warn(`No command matching ${interaction.commandName} was found`);
    return;
  }

  try {
    logger.info(`Executing command: ${interaction.commandName}`, {
      userId: interaction.user.id,
      username: interaction.user.username,
      guildId: interaction.guildId
    });

    await command.execute(interaction);
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}`, error);

    const replyContent = {
      content: 'There was an error while executing this command!',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyContent);
    } else {
      await interaction.reply(replyContent);
    }
  }
}
