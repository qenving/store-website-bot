import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { transactionEngine } from '../../core/transactions/TransactionEngine';
import { dal } from '../../core/db/dal';
import { configManager } from '../../core/config/config';
import { createLogger } from '../../core/logging/logger';
import { formatError } from '../../core/utils/errors';

const logger = createLogger({ module: 'BuyCommand' });

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Purchase a product from the store')
  .addStringOption(option =>
    option
      .setName('product')
      .setDescription('Product ID to purchase')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const productId = interaction.options.getString('product', true);
    const discordId = interaction.user.id;
    const username = interaction.user.username;

    logger.info('Buy command executed', { discordId, username, productId });

    const product = configManager.getProduct(productId);
    if (!product) {
      await interaction.editReply({
        content: `L Product not found: ${productId}\n\nAvailable products:\n${configManager
          .getAllProducts()
          .map(p => `" ${p.id} - ${p.name} (${p.price} ${p.currency})`)
          .join('\n')}`
      });
      return;
    }

    const user = await dal.users.getOrCreate(discordId, username);

    const result = await transactionEngine.createOrder({
      userId: user.id,
      productId: product.id,
      amount: product.price,
      currency: product.currency,
      metadata: {
        discordUserId: discordId,
        discordUsername: username
      }
    });

    const transaction = await transactionEngine.getStatus(result.orderId);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('=Ò Order Created')
      .setDescription(`Your order has been created successfully!`)
      .addFields(
        { name: 'Product', value: product.name, inline: true },
        { name: 'Price', value: `${product.price} ${product.currency}`, inline: true },
        { name: 'Order ID', value: result.orderId, inline: false },
        { name: 'Status', value: transaction.status.toUpperCase(), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Transaction ID: ${result.transactionId}` });

    if (result.paymentLink) {
      embed.addFields({
        name: '=³ Payment Link',
        value: `[Click here to pay](${result.paymentLink})`,
        inline: false
      });
    }

    await interaction.editReply({
      embeds: [embed]
    });

    logger.info('Order created successfully', {
      discordId,
      orderId: result.orderId,
      transactionId: result.transactionId
    });
  } catch (error) {
    logger.error('Failed to process buy command', error);
    const formattedError = formatError(error);

    await interaction.editReply({
      content: `L Failed to create order: ${formattedError.message}`
    });
  }
}
