import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { transactionEngine } from '../../core/transactions/TransactionEngine';
import { createLogger } from '../../core/logging/logger';
import { formatError } from '../../core/utils/errors';

const logger = createLogger({ module: 'OrderStatusCommand' });

export const data = new SlashCommandBuilder()
  .setName('orderstatus')
  .setDescription('Check the status of your order')
  .addStringOption(option =>
    option
      .setName('orderid')
      .setDescription('Order ID to check')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const orderId = interaction.options.getString('orderid', true);

    logger.info('Order status command executed', {
      discordId: interaction.user.id,
      orderId
    });

    const transaction = await transactionEngine.getStatus(orderId);

    const statusColors: Record<string, number> = {
      pending: 0xffff00,
      processing: 0x00bfff,
      completed: 0x00ff00,
      failed: 0xff0000,
      cancelled: 0x808080
    };

    const statusEmojis: Record<string, string> = {
      pending: 'ó',
      processing: '=',
      completed: '',
      failed: 'L',
      cancelled: '=«'
    };

    const embed = new EmbedBuilder()
      .setColor(statusColors[transaction.status] || 0x808080)
      .setTitle(`${statusEmojis[transaction.status] || '=æ'} Order Status`)
      .addFields(
        { name: 'Order ID', value: transaction.orderId, inline: false },
        { name: 'Status', value: transaction.status.toUpperCase(), inline: true },
        { name: 'Amount', value: `${transaction.amount} ${transaction.currency}`, inline: true },
        { name: 'Product ID', value: transaction.productId, inline: true },
        { name: 'Created', value: `<t:${Math.floor(transaction.createdAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Transaction ID: ${transaction.id}` });

    if (transaction.paymentLink && transaction.status !== 'completed') {
      embed.addFields({
        name: '=³ Payment Link',
        value: `[Click here to pay](${transaction.paymentLink})`,
        inline: false
      });
    }

    if (transaction.completedAt) {
      embed.addFields({
        name: 'Completed',
        value: `<t:${Math.floor(transaction.completedAt.getTime() / 1000)}:R>`,
        inline: true
      });
    }

    await interaction.editReply({
      embeds: [embed]
    });

    logger.info('Order status retrieved', {
      discordId: interaction.user.id,
      orderId,
      status: transaction.status
    });
  } catch (error) {
    logger.error('Failed to get order status', error);
    const formattedError = formatError(error);

    await interaction.editReply({
      content: `L Failed to get order status: ${formattedError.message}`
    });
  }
}
