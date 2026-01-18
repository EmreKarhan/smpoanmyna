const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');

// LOAD CONFIG WITH ERROR HANDLING
let config;
try {
    console.log('📁 Loading config file...');
    const configData = fs.readFileSync('./config.json', 'utf8');
    config = JSON.parse(configData);
    
    // DEBUG: Check config content
    console.log('✅ Config loaded:', {
        guildId: config.guildId,
        adminRoles: config.adminRoles,
        adminRolesIsArray: Array.isArray(config.adminRoles),
        logChannelId: config.logChannelId
    });
    
    // adminRoles array check
    if (!config.adminRoles) {
        console.warn('⚠️ adminRoles not defined, creating empty array...');
        config.adminRoles = [];
    } else if (!Array.isArray(config.adminRoles)) {
        console.warn('⚠️ adminRoles is not array, converting to array...');
        config.adminRoles = [config.adminRoles];
    }
    
    // Check other required fields
    if (!config.embedColor) config.embedColor = '#7c3aed';
    if (!config.branding) config.branding = {};
    if (!config.branding.footer) config.branding.footer = 'RuzySoft | Helper';
    if (!config.branding.icon) config.branding.icon = 'https://i.imgur.com/default-icon.png';
    
} catch (error) {
    console.error('❌ Error loading config:', error.message);
    console.log('ℹ️ Using default config...');
    
    // Default config
    config = {
        guildId: "1331289210627293276",
        ownerId: "741753240827461672",
        adminRoles: ["1462207491063419108"],
        logChannelId: "1460734266236211314",
        embedColor: "#7c3aed",
        branding: {
            name: "RuzySoft",
            icon: "https://cdn.discordapp.com/attachments/1462207492275572883/1462402361761730602/391a9977-1ccc-4749-be4c-f8cdfd572f6e.png",
            footer: "RuzySoft | Helpers"
        }
    };
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences
    ]
});

// DATABASE
const db = {
    warnings: {},
    logs: [],
    giveaways: []
};

// STATUS VARIABLES
let statusIndex = 0;
const statusMessages = [
    { 
        text: "https://discord.gg/pnTjcgSAMB", 
        type: 3 // WATCHING
    },
    { 
        text: "RUZYSOFT.NET", 
        type: 3 // WATCHING
    }
];

// ADMIN CHECK FUNCTION
function isAdmin(member) {
    try {
        if (!member) return false;
        if (!member.roles) return false;
        if (!member.roles.cache) return false;
        
        // Admin permission check
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            console.log(`✅ ${member.user.tag} has admin permissions`);
            return true;
        }
        
        // Check admin roles from config
        if (config.adminRoles && Array.isArray(config.adminRoles)) {
            const memberRoleIds = Array.from(member.roles.cache.keys());
            const hasAdminRole = config.adminRoles.some(adminRoleId => 
                memberRoleIds.includes(adminRoleId)
            );
            
            if (hasAdminRole) {
                console.log(`✅ ${member.user.tag} has admin role`);
                return true;
            }
        }
        
        console.log(`❌ ${member.user.tag} has no access`);
        return false;
        
    } catch (error) {
        console.error('Error in isAdmin function:', error);
        return false;
    }
}

// LOG FUNCTION
function logAction(action, user, moderator, details = {}) {
    try {
        const logEntry = {
            timestamp: Date.now(),
            action,
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag
            },
            moderator: {
                id: moderator.id,
                username: moderator.username,
                tag: moderator.tag
            },
            details
        };
        
        db.logs.push(logEntry);
        
        // Send to log channel
        if (config.logChannelId) {
            const logChannel = client.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`📝 ${action}`)
                    .setColor('#0099ff')
                    .addFields(
                        { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: '👮‍♂️ Moderator', value: moderator.tag, inline: true },
                        { name: '🕐 Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
                    )
                    .setTimestamp();
                
                Object.entries(details).forEach(([key, value]) => {
                    if (value) embed.addFields({ name: key, value: String(value), inline: true });
                });
                
                logChannel.send({ embeds: [embed] }).catch(console.error);
            }
        }
        
        // Save to file
        fs.appendFileSync('./logs.txt', JSON.stringify(logEntry) + '\n');
        
    } catch (error) {
        console.error('logAction error:', error);
    }
}

// DURATION PARSER
function parseDuration(duration) {
    try {
        const match = duration.match(/^(\d+)([smhd])$/);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch(unit) {
            case 's': return value * 1000;
            case 'm': return value * 60000;
            case 'h': return value * 3600000;
            case 'd': return value * 86400000;
            default: return null;
        }
    } catch {
        return null;
    }
}

// STATUS UPDATE FUNCTION
function updateStatus() {
    try {
        const status = statusMessages[statusIndex];
        
        // Status type conversion
        let activityType;
        switch (status.type) {
            case 0: activityType = 'PLAYING'; break;
            case 1: activityType = 'STREAMING'; break;
            case 2: activityType = 'LISTENING'; break;
            case 3: activityType = 'WATCHING'; break;
            case 4: activityType = 'COMPETING'; break;
            case 5: activityType = 'CUSTOM'; break;
            default: activityType = 'WATCHING';
        }
        
        client.user.setActivity(status.text, { 
            type: status.type 
        }).then(() => {
            console.log(`🔄 Status updated: ${activityType} ${status.text}`);
        }).catch(err => {
            console.error('❌ Error updating status:', err);
        });
        
        // Update index for next status
        statusIndex = (statusIndex + 1) % statusMessages.length;
        
    } catch (error) {
        console.error('Status update error:', error);
    }
}

// BOT READY EVENT
client.once('ready', async () => {
    console.log(`\n✨ ================================= ✨`);
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log(`🎯 Guild ID: ${config.guildId}`);
    console.log(`👑 Admin Roles: ${config.adminRoles.join(', ') || 'Not defined'}`);
    console.log(`✨ ================================= ✨\n`);
    
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
        console.error(`❌ Guild not found! (Guild ID: ${config.guildId})`);
        return;
    }
    
    console.log(`✅ Guild: ${guild.name} (${guild.memberCount} members)`);
    
    // SET INITIAL STATUS
    updateStatus();
    
    // UPDATE STATUS EVERY 10 SECONDS
    setInterval(updateStatus, 10000); // 10 seconds = 10000 milliseconds
    
    // SLASH COMMANDS
    const commands = [
        {
            name: 'help',
            description: 'Show help menu'
        },
        {
            name: 'panel',
            description: 'Create admin control panel'
        },
        {
            name: 'ban',
            description: 'Ban a user',
            options: [
                {
                    name: 'user',
                    description: 'User to ban',
                    type: 6,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Ban reason',
                    type: 3,
                    required: false
                },
                {
                    name: 'days',
                    description: 'Delete messages (0-7 days)',
                    type: 4,
                    required: false,
                    min_value: 0,
                    max_value: 7
                }
            ]
        },
        {
            name: 'kick',
            description: 'Kick a user',
            options: [
                {
                    name: 'user',
                    description: 'User to kick',
                    type: 6,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Kick reason',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'timeout',
            description: 'Timeout a user',
            options: [
                {
                    name: 'user',
                    description: 'User to timeout',
                    type: 6,
                    required: true
                },
                {
                    name: 'duration',
                    description: 'Duration (e.g., 30m, 2h, 1d)',
                    type: 3,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Reason',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'untimeout',
            description: 'Remove user timeout',
            options: [
                {
                    name: 'user',
                    description: 'User',
                    type: 6,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Reason',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'warn',
            description: 'Warn a user',
            options: [
                {
                    name: 'user',
                    description: 'User to warn',
                    type: 6,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Warning reason',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'warnings',
            description: 'Show user warnings',
            options: [
                {
                    name: 'user',
                    description: 'User',
                    type: 6,
                    required: true
                }
            ]
        },
        {
            name: 'purge',
            description: 'Clean messages',
            options: [
                {
                    name: 'amount',
                    description: 'Number of messages (1-100)',
                    type: 4,
                    required: true,
                    min_value: 1,
                    max_value: 100
                }
            ]
        },
        {
            name: 'lock',
            description: 'Lock channel'
        },
        {
            name: 'unlock',
            description: 'Unlock channel'
        },
        {
            name: 'userinfo',
            description: 'Show user information',
            options: [
                {
                    name: 'user',
                    description: 'User (leave empty for yourself)',
                    type: 6,
                    required: false
                }
            ]
        },
        {
            name: 'serverinfo',
            description: 'Show server information'
        },
        {
            name: 'embed',
            description: 'Create custom embed message',
            options: [
                {
                    name: 'title',
                    description: 'Title',
                    type: 3,
                    required: true
                },
                {
                    name: 'description',
                    description: 'Description',
                    type: 3,
                    required: true
                },
                {
                    name: 'color',
                    description: 'Color (e.g., #ff0000)',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'announce',
            description: 'Make announcement',
            options: [
                {
                    name: 'title',
                    description: 'Announcement title',
                    type: 3,
                    required: true
                },
                {
                    name: 'message',
                    description: 'Announcement message',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'ping',
            description: 'Show bot latency'
        },
        {
            name: 'stats',
            description: 'Show bot statistics'
        }
    ];
    
    try {
        await guild.commands.set(commands);
        console.log(`✅ ${commands.length} slash commands loaded!`);
    } catch (error) {
        console.error('❌ Error loading commands:', error);
    }
});

// SLASH COMMAND HANDLER
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, member, user } = interaction;
    
    console.log(`🔹 Command: /${commandName} - User: ${user.tag}`);
    
    try {
        // PERMISSION CHECK - ADMINS ONLY
        if (!isAdmin(member)) {
            console.log(`❌ Permission denied: ${user.tag}`);
            return interaction.reply({
                content: '❌ **Permission denied!** Only admins can use these commands.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        console.log(`✅ Permission granted: ${user.tag}`);
        
        // COMMAND ROUTING
        switch (commandName) {
            case 'help':
                await handleHelp(interaction);
                break;
            case 'panel':
                await handlePanel(interaction);
                break;
            case 'ban':
                await handleBan(interaction);
                break;
            case 'kick':
                await handleKick(interaction);
                break;
            case 'timeout':
                await handleTimeout(interaction);
                break;
            case 'untimeout':
                await handleUntimeout(interaction);
                break;
            case 'warn':
                await handleWarn(interaction);
                break;
            case 'warnings':
                await handleWarnings(interaction);
                break;
            case 'purge':
                await handlePurge(interaction);
                break;
            case 'lock':
                await handleLock(interaction);
                break;
            case 'unlock':
                await handleUnlock(interaction);
                break;
            case 'userinfo':
                await handleUserInfo(interaction);
                break;
            case 'serverinfo':
                await handleServerInfo(interaction);
                break;
            case 'embed':
                await handleEmbed(interaction);
                break;
            case 'announce':
                await handleAnnounce(interaction);
                break;
            case 'ping':
                await handlePing(interaction);
                break;
            case 'stats':
                await handleStats(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown command!',
                    flags: MessageFlags.Ephemeral
                });
        }
        
    } catch (error) {
        console.error(`❌ Command error (/${commandName}):`, error);
        
        try {
            await interaction.reply({
                content: '❌ An error occurred! Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
});

// ============ COMMAND HANDLERS ============

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🛠️ RuzySoft Admin Bot - Help')
        .setColor(config.embedColor)
        .setDescription('**Commands available only to admins:**')
        .addFields(
            { 
                name: '🛡️ Moderation', 
                value: '`/ban` - Ban user\n`/kick` - Kick user\n`/timeout` - Timeout user\n`/warn` - Warn user' 
            },
            { 
                name: '🔧 Management', 
                value: '`/purge` - Clean messages\n`/lock` - Lock channel\n`/unlock` - Unlock channel' 
            },
            { 
                name: '📊 Information', 
                value: '`/userinfo` - User info\n`/serverinfo` - Server info\n`/stats` - Bot statistics' 
            },
            { 
                name: '📢 Announcements', 
                value: '`/announce` - Make announcement\n`/embed` - Create custom embed' 
            },
            { 
                name: '⚙️ Utilities', 
                value: '`/panel` - Control panel\n`/ping` - Ping test\n`/help` - This menu' 
            }
        )
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handlePanel(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎛️ RuzySoft Admin Panel')
        .setColor(config.embedColor)
        .setDescription('**Admin Control Panel**\nUse the buttons below to manage the server.')
        .addFields(
            { name: '🛡️ Moderation', value: 'Ban, Kick, Timeout, Warn', inline: true },
            { name: '🔧 Management', value: 'Lock, Purge, Settings', inline: true },
            { name: '📊 Information', value: 'Stats, Info, Logs', inline: true }
        )
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('mod_panel')
                .setLabel('🛡️ Moderation')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('mgmt_panel')
                .setLabel('🔧 Management')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('info_panel')
                .setLabel('📊 Information')
                .setStyle(ButtonStyle.Success)
        );
    
    await interaction.reply({ 
        content: '**Admin Panel Created!**',
        embeds: [embed], 
        components: [row] 
    });
}

async function handleBan(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const days = interaction.options.getInteger('days') || 0;
    
    try {
        await interaction.guild.members.ban(user.id, { 
            reason: `${interaction.user.tag}: ${reason}`,
            deleteMessageSeconds: days * 86400
        });
        
        logAction('Ban', user, interaction.user, { reason, days });
        
        const embed = new EmbedBuilder()
            .setTitle('🔨 User Banned')
            .setColor('#ef4444')
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})` },
                { name: '👮‍♂️ Moderator', value: interaction.user.tag },
                { name: '📝 Reason', value: reason },
                { name: '🗑️ Messages Deleted', value: `${days} days` }
            )
            .setFooter({ text: 'RuzySoft | Moderation' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Ban error:', error);
        await interaction.reply({
            content: '❌ Failed to ban user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleKick(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
        await interaction.guild.members.kick(user.id, `${interaction.user.tag}: ${reason}`);
        
        logAction('Kick', user, interaction.user, { reason });
        
        const embed = new EmbedBuilder()
            .setTitle('👢 User Kicked')
            .setColor('#f59e0b')
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})` },
                { name: '👮‍♂️ Moderator', value: interaction.user.tag },
                { name: '📝 Reason', value: reason }
            )
            .setFooter({ text: 'RuzySoft | Moderation' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Kick error:', error);
        await interaction.reply({
            content: '❌ Failed to kick user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleTimeout(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    const ms = parseDuration(duration);
    if (!ms || ms > 2419200000) {
        return interaction.reply({
            content: '❌ Invalid duration! Usage: 30m, 2h, 1d',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.timeout(ms, `${interaction.user.tag}: ${reason}`);
        
        logAction('Timeout', user, interaction.user, { reason, duration });
        
        const embed = new EmbedBuilder()
            .setTitle('⏰ User Timed Out')
            .setColor('#8b5cf6')
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})` },
                { name: '👮‍♂️ Moderator', value: interaction.user.tag },
                { name: '⏱️ Duration', value: duration },
                { name: '📝 Reason', value: reason }
            )
            .setFooter({ text: 'RuzySoft | Moderation' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Timeout error:', error);
        await interaction.reply({
            content: '❌ Failed to timeout user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUntimeout(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.timeout(null, `${interaction.user.tag}: ${reason}`);
        
        logAction('Untimeout', user, interaction.user, { reason });
        
        await interaction.reply({
            content: `✅ **${user.tag}** timeout removed!\n**Reason:** ${reason}`
        });
        
    } catch (error) {
        console.error('Untimeout error:', error);
        await interaction.reply({
            content: '❌ Failed to remove timeout!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleWarn(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    
    if (!db.warnings[user.id]) {
        db.warnings[user.id] = [];
    }
    
    db.warnings[user.id].push({
        reason,
        admin: interaction.user.tag,
        timestamp: Date.now()
    });
    
    logAction('Warn', user, interaction.user, { reason });
    
    const warnCount = db.warnings[user.id].length;
    const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setColor('#fbbf24')
        .addFields(
            { name: '👤 User', value: `${user.tag} (${user.id})` },
            { name: '👮‍♂️ Moderator', value: interaction.user.tag },
            { name: '📝 Reason', value: reason },
            { name: '📊 Total Warnings', value: warnCount.toString() }
        )
        .setFooter({ text: 'RuzySoft | Moderation' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleWarnings(interaction) {
    const user = interaction.options.getUser('user');
    const warnings = db.warnings[user.id] || [];
    
    if (warnings.length === 0) {
        return interaction.reply({
            content: `✅ **${user.tag}** has no warnings.`
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`📝 ${user.tag} - Warning History`)
        .setColor('#f59e0b')
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Total warnings: ${warnings.length}` })
        .setTimestamp();
    
    warnings.forEach((warn, index) => {
        embed.addFields({
            name: `Warning #${index + 1}`,
            value: `**Reason:** ${warn.reason}\n**Admin:** ${warn.admin}\n**Time:** <t:${Math.floor(warn.timestamp/1000)}:R>`
        });
    });
    
    await interaction.reply({ embeds: [embed] });
}

async function handlePurge(interaction) {
    const amount = interaction.options.getInteger('amount');
    
    if (amount < 1 || amount > 100) {
        return interaction.reply({
            content: '❌ Amount must be between 1-100!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const messages = await interaction.channel.messages.fetch({ limit: amount });
        await interaction.channel.bulkDelete(messages, true);
        
        logAction('Purge', interaction.user, interaction.user, { amount, channel: interaction.channel.name });
        
        await interaction.editReply({
            content: `✅ ${messages.size} messages deleted.`
        });
        
    } catch (error) {
        console.error('Purge error:', error);
        await interaction.editReply({
            content: '❌ Failed to delete messages!'
        });
    }
}

async function handleLock(interaction) {
    try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
            SendMessages: false
        });
        
        const embed = new EmbedBuilder()
            .setTitle('🔒 Channel Locked')
            .setColor('#ef4444')
            .setDescription(`This channel has been locked by ${interaction.user}.`)
            .setTimestamp();
        
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({
            content: '✅ Channel successfully locked!',
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('Lock error:', error);
        await interaction.reply({
            content: '❌ Failed to lock channel!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUnlock(interaction) {
    try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
            SendMessages: true
        });
        
        await interaction.reply({
            content: '✅ Channel unlocked!',
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('Unlock error:', error);
        await interaction.reply({
            content: '❌ Failed to unlock channel!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUserInfo(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        
        const embed = new EmbedBuilder()
            .setTitle(`👤 ${targetUser.tag}`)
            .setColor('#3b82f6')
            .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
            .addFields(
                { name: '🆔 ID', value: targetUser.id, inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp/1000)}:R>`, inline: true },
                { name: '🏠 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
                { name: '👑 Highest Role', value: member.roles.highest.toString(), inline: true },
                { name: '🎭 Role Count', value: (member.roles.cache.size - 1).toString(), inline: true },
                { name: '✨ Nitro Boost', value: member.premiumSince ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: `Requested by: ${interaction.user.tag}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('UserInfo error:', error);
        await interaction.reply({
            content: '❌ Failed to get user information!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleServerInfo(interaction) {
    const guild = interaction.guild;
    
    const embed = new EmbedBuilder()
        .setTitle(guild.name)
        .setColor('#8b5cf6')
        .setThumbnail(guild.iconURL({ size: 512 }))
        .addFields(
            { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
            { name: '👥 Members', value: guild.memberCount.toString(), inline: true },
            { name: '📚 Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: '🎭 Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: '✨ Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
            { name: '🌍 Region', value: guild.preferredLocale, inline: true },
            { name: '🛡️ Security Level', value: guild.verificationLevel.toString(), inline: true }
        )
        .setFooter({ text: `Server ID: ${guild.id}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleEmbed(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || config.embedColor;
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleAnnounce(interaction) {
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    
    const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setColor('#10b981')
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handlePing(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setDescription(`**WebSocket Latency:** ${client.ws.ping}ms\n**Bot Latency:** ${Date.now() - interaction.createdTimestamp}ms`)
        .setColor('#10b981')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📊 RuzySoft Statistics')
        .setColor('#8b5cf6')
        .addFields(
            { name: '🤖 Bot Uptime', value: formatUptime(process.uptime()), inline: true },
            { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true },
            { name: '👥 Total Members', value: interaction.guild.memberCount.toString(), inline: true },
            { name: '📚 Total Channels', value: interaction.guild.channels.cache.size.toString(), inline: true },
            { name: '🎭 Total Roles', value: interaction.guild.roles.cache.size.toString(), inline: true },
            { name: '⚠️ Total Warnings', value: Object.values(db.warnings).reduce((a, b) => a + b.length, 0).toString(), inline: true },
            { name: '📝 Total Logs', value: db.logs.length.toString(), inline: true },
            { name: '🔄 Command Count', value: '20+', inline: true }
        )
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// ERROR HANDLING
client.on('error', error => {
    console.error('Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

// START BOT
console.log('🚀 Starting bot...');
client.login(process.env.DISCORD_TOKEN);
