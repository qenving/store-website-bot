let {
    InteractionType,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
} = require("discord.js");

let client = require('../../index');
let { Crown, Dolar, Wallet, Bot, Globe, Saweria, Trakteer, WL, imageUrl, COLOR, DL, ARROW } = require("../../config/configEmoji.json");
let Balance = require("../../Schema/balance.js");
let { MessageEmbed } = require("discord.js");
let depositSchema = require("../../Schema/depo.js");
let cooldown = new Map();

module.exports = {
    name: "ButtonInteractionHandler"
};

client.on("interactionCreate", async (interaction) => {
    if (interaction.customId === "balanceInfo") {
        try {
            let userId = interaction.user.id;
            let actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Set Your GrowID")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("<:Bot:1170169208273903677>")
                    .setCustomId("setGrowID")
            );

            let lastCooldown = cooldown.get(interaction.user.id);
            if (lastCooldown && Date.now() < lastCooldown) {
                let remainingTime = Math.ceil((lastCooldown - Date.now()) / 1000);
                return interaction.reply({
                    content: `Please wait **${remainingTime} seconds** before using this button again.`,
                    ephemeral: true
                });
            }

            cooldown.set(interaction.user.id, Date.now() + 5000);

            let userBalance = await Balance.findOne({ DiscordID: userId })
                .catch((err) => console.error(err));

            if (!userBalance) {
                return interaction.reply({
                    content: "**Please set your GrowID first before using this button!**",
                    components: [actionRow],
                    ephemeral: true
                });
            }

            let userName = interaction.user.username;
            let balance = parseFloat(userBalance.Balance).toFixed(1);

            let embedMessage = new EmbedBuilder()
                .setTitle(`${Crown} ${userName}'s Balance ${Crown}`)
                .setDescription(
                    `- [${Bot}] GrowID: **${userBalance.GrowIDNow}**\n` +
                    `- [${Wallet}] Balance: **${balance} ${WL}**\n` +
                    `- [${Wallet}] Total Deposit: **${userBalance.Deposit} ${WL}**`
                )
                .setImage(imageUrl)
                .setColor(COLOR);

            await interaction.reply({ embeds: [embedMessage], ephemeral: true });
        } catch (error) {
            console.error(error);
        }
    }

    if (interaction.customId === "depositInfo") {
        try {
            let userId = interaction.user.id;
            let actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Set Your GrowID")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("<:Bot:1170169208273903677>")
                    .setCustomId("setGrowID")
            );

            let lastCooldown = cooldown.get(interaction.user.id);
            if (lastCooldown && Date.now() < lastCooldown) {
                let remainingTime = Math.ceil((lastCooldown - Date.now()) / 1000);
                return interaction.reply({
                    content: `Please wait **${remainingTime} seconds** before using this button again.`,
                    ephemeral: true
                });
            }

            cooldown.set(interaction.user.id, Date.now() + 5000);

            let userBalance = await Balance.findOne({ DiscordID: userId })
                .catch((err) => console.error(err));

            if (!userBalance) {
                return interaction.reply({
                    content: "**Please set your GrowID first before using this button!**",
                    components: [actionRow],
                    ephemeral: true
                });
            }

            let worldDepositInfo = await depositSchema.findOne({})
                .catch((err) => console.error(err));

            let totalDeposit = worldDepositInfo.ratedl * 100;

            let embedMessage = new EmbedBuilder()
                .setTitle(`${Crown} Deposit Information ${Crown}`)
                .setDescription(
                    `- [${Globe}] World: **${worldDepositInfo?.world || "Not Set"}**\n` +
                    `- [${Crown}] Owner: **${worldDepositInfo?.owner || "Not Set"}**\n` +
                    `- [${Bot}] Bot Name: **${worldDepositInfo?.botName || "Not Set"}**` +
                    (worldDepositInfo?.saweria !== "Not Set" ? `\n- [${Saweria}] Saweria Link: **${worldDepositInfo.saweria}**` : "") +
                    (worldDepositInfo?.Trakteer !== "Not Set" ? `\n- [${Trakteer}] Trakteer Link: **${worldDepositInfo.Trakteer}**` : "") +
                    (worldDepositInfo?.ratedl && worldDepositInfo?.saweria !== "Not Set" || worldDepositInfo?.Trakteer !== "Not Set" ?
                        `\n- [${DL}] Rate DL: **${new Intl.NumberFormat().format(totalDeposit)}**` : "")
                )
                .setTimestamp()
                .setImage(imageUrl)
                .setColor(COLOR)
                .setFooter({
                    text: `Note: Please verify the bot's world before donating.`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
                });

            await interaction.reply({ embeds: [embedMessage], ephemeral: true });
        } catch (error) {
            console.error(error);
        }
    }

    if (interaction.customId === "setGrowIDModal") {
        if (interaction.type !== InteractionType.ModalSubmit) return;
        try {
            let enteredId = interaction.fields.getTextInputValue("growIDInput");
            let confirmation = interaction.fields.getTextInputValue("confirmGrowID");

            let GrowID = enteredId.toLowerCase();
            let userId = interaction.user.id;

            if (!confirmation.includes(enteredId)) {
                return interaction.reply({
                    content: `Please enter the correct GrowID.`,
                    ephemeral: true
                });
            }

            let existingBalance = await Balance.findOne({ DiscordID: userId })
                .catch((err) => console.error(err));

            let existingGrowID = await Balance.findOne({ GrowID: GrowID })
                .then((d) => d?.DiscordID)
                .catch((err) => console.error(err));

            if (existingGrowID && existingGrowID !== userId) {
                return interaction.reply({
                    content: `This GrowID is already taken!`,
                    ephemeral: true
                });
            }

            if (existingGrowID && existingBalance.GrowID === GrowID) {
                return interaction.reply({
                    content: `You have already used this GrowID.`,
                    ephemeral: true
                });
            }

            await Balance.findOneAndUpdate(
                { DiscordID: userId },
                { $set: { GrowID: GrowID, GrowIDNow: enteredId } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).then(async (result) => {
                if (!existingBalance) {
                    await interaction.reply({
                        content: `Successfully set your GrowID to **${enteredId}**.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Successfully updated your GrowID from **${existingBalance.GrowIDNow}** to **${enteredId}**.`,
                        ephemeral: true,
                    });
                }
            });
        } catch (error) {
            console.error(error);
        }
    }
});
