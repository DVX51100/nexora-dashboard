

require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');

if (!process.env.TOKEN) {
    console.error("❌ TOKEN manquant !");
    process.exit(1);
}


const mongoose = require("mongoose");

/* ================= MONGODB ================= */

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
    console.log("🟢 MongoDB connecté (BOT)");
});

mongoose.connection.on("error", (err) => {
    console.log("🔴 Erreur MongoDB :", err);
});

const GuildConfig = mongoose.model("GuildConfig", {
    guildId: String,
    aiEnabled: Boolean
});

/* ================= CONFIG ================= */

const CATEGORY_ID = "1474354416231383167";
const STAFF_ROLE_ID = "1474356492600737872";
const LOG_CHANNEL_ID = "1474356598825812019";
const SAVE_CHANNEL_ID = "1474356680635584699";

const WELCOME_CHANNEL_ID = "1474369182341664799";
const AUTO_ROLE_ID = "1474369204307234901";

const INACTIVE_TIME = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_TIME = 5 * 60 * 1000;
const MAX_TICKETS_PER_DAY = 3;
const DAY_TIME = 24 * 60 * 60 * 1000;

const ticketCooldown = new Map();
const ticketDailyLimit = new Map();
const aiEnabledTickets = new Map();
const ticketMemory = new Map();

/* ================= CLIENT ================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('clientReady', () => {
    console.log(`✅ Nexora connecté en tant que ${client.user.tag}`);
});

/* ================= BIENVENUE ================= */

client.on("guildMemberAdd", async (member) => {

    const memberCount = member.guild.memberCount;
    const formattedCount = `#${memberCount.toString().padStart(4, "0")}`;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);

    if (channel) {
        const embed = new EmbedBuilder()
            .setColor("#00ff99")
            .setTitle("🎉 Nouveau membre !")
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setDescription(
                `Bienvenue ${member} sur **${member.guild.name}** ! 🎮\n\n` +
                `🔢 Tu es le membre **${formattedCount}**.\n\n` +
                `🔥 Bonne aventure sur le serveur !`
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
    if (role) member.roles.add(role).catch(() => {});

    member.send({
        embeds: [
            new EmbedBuilder()
                .setColor("#5865F2")
                .setTitle(`🎮 Bienvenue sur ${member.guild.name}`)
                .setDescription(
                    `Salut **${member.user.username}** 👋\n\n` +
                    `✨ Tu es officiellement le membre **${formattedCount}**.\n\n` +
                    `📜 Pense à lire le règlement.\n` +
                    `🎟️ Besoin d'aide ? Utilise le système de tickets.\n\n` +
                    `🔥 Bon RP !`
                )
        ]
    }).catch(() => {});
});

/* ================= IA AVANCÉE ================= */

function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function aiResponse(content, channelId) {

    const msg = content.toLowerCase().trim();

    const ignore = ["ok", "merci", "mdr", "lol", "?", "d'accord", "dac", "niquel", "nickel"];
    if (ignore.includes(msg)) return null;

    const greetings = ["salut", "bonjour", "hey", "yo", "coucou"];
    if (greetings.includes(msg)) {
        return "👋 Salut ! Explique-moi ton problème et je vais t'aider.";
    }

    if (!ticketMemory.has(channelId)) {
        ticketMemory.set(channelId, []);
    }

    const memory = ticketMemory.get(channelId);
    memory.push(msg);
    if (memory.length > 5) memory.shift();

    let score = {
        whitelist: 0,
        police: 0,
        ems: 0,
        bug: 0,
        argent: 0,
        staff: 0,
        urgence: 0
    };

    const keywords = {
        whitelist: ["whitelist", "candidature", "formulaire", "accepte", "refus"],
        police: ["police", "lspd"],
        ems: ["ems", "ambulance", "hopital"],
        bug: ["bug", "probleme", "erreur", "marche pas", "crash"],
        argent: ["argent", "money", "cash", "banque"],
        staff: ["staff", "admin", "modo"],
        urgence: ["urgent", "vite", "rapidement", "help", "aide"]
    };

    for (let category in keywords) {
        for (let word of keywords[category]) {
            if (msg.includes(word)) {
                score[category]++;
            }
        }
    }

    if (msg.includes("!!!")) score.urgence += 2;

    const highest = Object.keys(score).reduce((a, b) =>
        score[a] > score[b] ? a : b
    );

    const responses = {
        whitelist: [
            "📋 Pour la whitelist, rends-toi dans le salon dédié et remplis le formulaire.",
            "📝 La candidature whitelist se fait via le formulaire officiel."
        ],
        police: [
            "🚓 Pour rejoindre la police, il faut être whitelist puis déposer une candidature.",
            "👮 Les recrutements police sont annoncés dans le salon annonces."
        ],
        ems: [
            "🚑 Les recrutements EMS sont annoncés régulièrement."
        ],
        bug: [
            "🐛 Merci de préciser : lieu, heure et description complète du bug.",
            "⚙️ Décris exactement le problème pour qu'on puisse intervenir."
        ],
        argent: [
            "💰 Les systèmes d'argent RP sont expliqués dans le règlement."
        ],
        staff: [
            "👮 Le staff va te répondre dès que possible."
        ],
        urgence: [
            "🚨 Ton message semble urgent. Le staff est notifié."
        ]
    };

    if (score[highest] === 0) {
        return null; // NE RÉPOND PLUS pour éviter spam inutile
    }

    return random(responses[highest]);
}

/* ================= MESSAGE LISTENER ================= */

client.on('messageCreate', async (message) => {

    if (!message.guild) return;
    if (message.author.bot) return;

    console.log("Guild:", message.guild.id);

    const config = await GuildConfig.findOne({ guildId: message.guild.id });

    console.log("Mongo config:", config);

    if (
        message.mentions.roles.has(STAFF_ROLE_ID) &&
        !message.member.roles.cache.has(STAFF_ROLE_ID)
    ) {
        await message.delete();
        const warn = await message.channel.send("❌ Tu ne peux pas mentionner le staff.");
        setTimeout(() => warn.delete().catch(() => {}), 5000);
        return;
    }

    // IA activée via site OU via bouton ticket
    if ((config && config.aiEnabled) || aiEnabledTickets.has(message.channel.id)) {

        const response = aiResponse(message.content, message.channel.id);
        if (!response) return;

        message.channel.sendTyping();

        setTimeout(() => {
            message.channel.send(response);
        }, 800);
    }

    if (message.content === "!panel") {

        const embed = new EmbedBuilder()
            .setTitle("🎟️ Support GTA RP")
            .setDescription("Clique sur le bouton pour ouvrir un ticket.")
            .setColor("#5865F2");

        const button = new ButtonBuilder()
            .setCustomId("open_ticket")
            .setLabel("🎟️ Ouvrir un ticket")
            .setStyle(ButtonStyle.Primary);

        message.channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)]
        });
    }
});

/* ================= AUTO CLOSE ================= */

function scheduleAutoClose(channel) {
    setTimeout(async () => {
        if (!channel) return;

        const lastMessages = await channel.messages.fetch({ limit: 1 });
        const last = lastMessages.first();
        if (!last) return;

        if (Date.now() - last.createdTimestamp >= INACTIVE_TIME) {
            await channel.send("⏳ Ticket fermé automatiquement après 7 jours d'inactivité.");
            setTimeout(() => channel.delete().catch(() => {}), 5000);
        }
    }, INACTIVE_TIME);
}

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async (interaction) => {

    if (interaction.isButton() && interaction.customId === "open_ticket") {

        const userId = interaction.user.id;
        const now = Date.now();

        if (!ticketDailyLimit.has(userId)) {
            ticketDailyLimit.set(userId, { count: 0, firstTicketTime: now });
        }

        const userData = ticketDailyLimit.get(userId);

        if (now - userData.firstTicketTime > DAY_TIME) {
            userData.count = 0;
            userData.firstTicketTime = now;
        }

        if (userData.count >= MAX_TICKETS_PER_DAY) {
            return interaction.reply({ content: "🚫 Limite atteinte.", ephemeral: true });
        }

        if (ticketCooldown.has(userId)) {
            const expiration = ticketCooldown.get(userId) + COOLDOWN_TIME;
            if (now < expiration) {
                const remaining = Math.ceil((expiration - now) / 60000);
                return interaction.reply({ content: `⏳ Attends ${remaining} min.`, ephemeral: true });
            }
        }

        ticketCooldown.set(userId, now);
        userData.count++;

        const modal = new ModalBuilder()
            .setCustomId("ticket_modal")
            .setTitle("🎟️ Ouvrir un ticket");

        const reasonInput = new TextInputBuilder()
            .setCustomId("ticket_reason")
            .setLabel("Pourquoi ouvres-tu ce ticket ?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {

        const reason = interaction.fields.getTextInputValue("ticket_reason");
        const shortReason = reason.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/gi, "").substring(0, 15);
        const channelName = `${interaction.user.username.toLowerCase()}-${shortReason}`;

        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ],
        });

        const closeButton = new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("🔒 Fermer")
            .setStyle(ButtonStyle.Danger);

        const aiButton = new ButtonBuilder()
            .setCustomId("toggle_ai")
            .setLabel("🤖 IA")
            .setStyle(ButtonStyle.Success);

        await channel.send({
            content: `🎫 Ticket ouvert par ${interaction.user}\n📌 Raison : ${reason}`,
            components: [new ActionRowBuilder().addComponents(closeButton, aiButton)]
        });

        scheduleAutoClose(channel);

        await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { aiEnabled: true },
    { upsert: true }
);

        return interaction.reply({ content: `✅ Ticket créé : ${channel}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "toggle_ai") {

        const channelId = interaction.channel.id;

        if (aiEnabledTickets.has(channelId)) {

            if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.reply({
                    content: "❌ Seul le staff peut désactiver l'IA.",
                    ephemeral: true
                });
            }

            aiEnabledTickets.delete(channelId);
            return interaction.reply("🤖 IA désactivée.");
        } else {

            aiEnabledTickets.set(channelId, true);
            return interaction.reply("🤖 IA activée ! Pose ta question 👇");
        }
    }

    if (interaction.isButton() && interaction.customId === "close_ticket") {
        interaction.channel.delete();
    }
});

client.login(process.env.TOKEN);