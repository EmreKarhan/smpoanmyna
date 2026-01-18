const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');

// Load config file
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

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

// Database simulation
let db = {
    warnings: {},
    logs: [],
    temporaryRoles: {},
    suggestions: [],
    afkUsers: {},
    giveaways: []
};

// Helper functions
function isStaff(member) {
    return config.staffRoles.some(roleId => member.roles.cache.has(roleId)) || 
           member.permissions.has(PermissionFlagsBits.Administrator);
}

function isAdmin(member) {
    return config.adminRoles.some(roleId => member.roles.cache.has(roleId)) || 
           member.permissions.has(PermissionFlagsBits.Administrator);
}

function logAction(action, user, staff, details = {}) {
    const logEntry = {
        timestamp: Date.now(),
        action,
        user: {
            id: user.id,
            username: user.username,
            tag: user.tag
        },
        staff: {
            id: staff.id,
            username: staff.username,
            tag: staff.tag
        },
        details
    };
    
    db.logs.push(logEntry);
    
    // Send to log channel
    const logChannel = client.channels.cache.get(config.logChannelId);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle(`📝 Log: ${action}`)
            .setColor('#0099ff')
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
                { name: '🛠️ Staff', value: `${staff.tag}`, inline: true },
                { name: '📅 Time', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        Object.entries(details).forEach(([key, value]) => {
            embed.addFields({ name: key, value: String(value), inline: true });
        });
        
        logChannel.send({ embeds: [embed] });
    }
    
    // Save to log file
    fs.appendFileSync('./logs.txt', JSON.stringify(logEntry) + '\n');
}

function parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhdw])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch(unit) {
        case 's': return value * 1000;
        case 'm': return value * 60000;
        case 'h': return value * 3600000;
        case 'd': return value * 86400000;
        case 'w': return value * 604800000;
        default: return null;
    }
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Bot ready event
client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    
    // Register slash commands
    const commands = [
        {
            name: 'setup',
            description: 'Setup RuzySoft systems',
            options: [{
                name: 'system',
                description: 'System to setup',
                type: 3,
                required: true,
                choices: [
                    { name: '🎛️ Control Panel', value: 'panel' },
                    { name: '🎟️ Applications', value: 'applications' }
                ]
            }]
        },
        {
            name: 'ban',
            description: 'Ban a user from server',
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
                    description: 'Delete messages (days)',
                    type: 4,
                    required: false,
                    min_value: 0,
                    max_value: 7
                }
            ]
        },
        {
            name: 'unban',
            description: 'Unban a user',
            options: [
                {
                    name: 'user_id',
                    description: 'User ID to unban',
                    type: 3,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Unban reason',
                    type: 3,
                    required: false
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
                    description: 'Warn reason',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'warnings',
            description: 'Check user warnings',
            options: [
                {
                    name: 'user',
                    description: 'User to check',
                    type: 6,
                    required: true
                }
            ]
        },
        {
            name: 'clearwarns',
            description: 'Clear user warnings',
            options: [
                {
                    name: 'user',
                    description: 'User to clear',
                    type: 6,
                    required: true
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
                    description: 'Duration (e.g., 60s, 30m, 2h, 1d)',
                    type: 3,
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Timeout reason',
                    type: 3,
                    required: false
                }
            ]
        },
        {
            name: 'untimeout',
            description: 'Remove timeout',
            options: [
                {
                    name: 'user',
                    description: 'User to untimeout',
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
            name: 'purge',
            description: 'Bulk delete messages',
            options: [
                {
                    name: 'amount',
                    description: 'Number of messages',
                    type: 4,
                    required: true,
                    min_value: 1,
                    max_value: 100
                },
                {
                    name: 'user',
                    description: 'Filter by user',
                    type: 6,
                    required: false
                }
            ]
        },
        {
            name: 'lock',
            description: 'Lock channel',
            options: [
                {
                    name: 'channel',
                    description: 'Channel to lock',
                    type: 7,
                    required: false
                }
            ]
        },
        {
            name: 'unlock',
            description: 'Unlock channel',
            options: [
                {
                    name: 'channel',
                    description: 'Channel to unlock',
                    type: 7,
                    required: false
                }
            ]
        },
        {
            name: 'slowmode',
            description: 'Set slowmode',
            options: [
                {
                    name: 'duration',
                    description: 'Slowmode in seconds',
                    type: 4,
                    required: true,
                    min_value: 0,
                    max_value: 21600
                },
                {
                    name: 'channel',
                    description: 'Channel to set',
                    type: 7,
                    required: false
                }
            ]
        },
        {
            name: 'nick',
            description: 'Change user nickname',
            options: [
                {
                    name: 'user',
                    description: 'User to nick',
                    type: 6,
                    required: true
                },
                {
                    name: 'nickname',
                    description: 'New nickname',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'addrole',
            description: 'Add role to user',
            options: [
                {
                    name: 'user',
                    description: 'User to add role',
                    type: 6,
                    required: true
                },
                {
                    name: 'role',
                    description: 'Role to add',
                    type: 8,
                    required: true
                }
            ]
        },
        {
            name: 'removerole',
            description: 'Remove role from user',
            options: [
                {
                    name: 'user',
                    description: 'User to remove role',
                    type: 6,
                    required: true
                },
                {
                    name: 'role',
                    description: 'Role to remove',
                    type: 8,
                    required: true
                }
            ]
        },
        {
            name: 'userinfo',
            description: 'Get user information',
            options: [
                {
                    name: 'user',
                    description: 'User to check',
                    type: 6,
                    required: false
                }
            ]
        },
        {
            name: 'serverinfo',
            description: 'Get server information'
        },
        {
            name: 'roleinfo',
            description: 'Get role information',
            options: [
                {
                    name: 'role',
                    description: 'Role to check',
                    type: 8,
                    required: true
                }
            ]
        },
        {
            name: 'embed',
            description: 'Create embed message',
            options: [
                {
                    name: 'title',
                    description: 'Embed title',
                    type: 3,
                    required: true
                },
                {
                    name: 'description',
                    description: 'Embed description',
                    type: 3,
                    required: true
                },
                {
                    name: 'color',
                    description: 'Embed color (hex)',
                    type: 3,
                    required: false
                },
                {
                    name: 'channel',
                    description: 'Channel to send',
                    type: 7,
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
                },
                {
                    name: 'ping',
                    description: 'Role to ping',
                    type: 8,
                    required: false
                }
            ]
        },
        {
            name: 'giveaway',
            description: 'Create giveaway',
            options: [
                {
                    name: 'prize',
                    description: 'Giveaway prize',
                    type: 3,
                    required: true
                },
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 2d)',
                    type: 3,
                    required: true
                },
                {
                    name: 'winners',
                    description: 'Number of winners',
                    type: 4,
                    required: true,
                    min_value: 1,
                    max_value: 10
                }
            ]
        },
        {
            name: 'poll',
            description: 'Create poll',
            options: [
                {
                    name: 'question',
                    description: 'Poll question',
                    type: 3,
                    required: true
                },
                {
                    name: 'options',
                    description: 'Options (comma separated)',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'stats',
            description: 'Show bot statistics'
        },
        {
            name: 'ping',
            description: 'Check bot latency'
        },
        {
            name: 'help',
            description: 'Show help menu',
            options: [
                {
                    name: 'command',
                    description: 'Specific command help',
                    type: 3,
                    required: false
                }
            ]
        }
    ];
    
    try {
        await guild.commands.set(commands);
        console.log('✅ Slash commands loaded!');
    } catch (error) {
        console.error('❌ Error loading commands:', error);
    }
    
    // Update bot status
    setInterval(() => {
        const activities = [
            `${guild.memberCount} members`,
            `${guild.channels.cache.size} channels`,
            'RuzySoft | Premium Services'
        ];
        const activity = activities[Math.floor(Math.random() * activities.length)];
        client.user.setActivity(activity, { type: 3 });
    }, 10000);
});

// Slash command handler
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName;
        const member = interaction.member;
        
        // Staff only commands
        if (!isStaff(member) && !config.publicCommands.includes(command)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        switch (command) {
            case 'setup':
                await handleSetup(interaction);
                break;
            case 'ban':
                await handleBan(interaction);
                break;
            case 'unban':
                await handleUnban(interaction);
                break;
            case 'kick':
                await handleKick(interaction);
                break;
            case 'warn':
                await handleWarn(interaction);
                break;
            case 'warnings':
                await handleWarnings(interaction);
                break;
            case 'clearwarns':
                await handleClearWarns(interaction);
                break;
            case 'timeout':
                await handleTimeout(interaction);
                break;
            case 'untimeout':
                await handleUntimeout(interaction);
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
            case 'slowmode':
                await handleSlowmode(interaction);
                break;
            case 'nick':
                await handleNick(interaction);
                break;
            case 'addrole':
                await handleAddRole(interaction);
                break;
            case 'removerole':
                await handleRemoveRole(interaction);
                break;
            case 'userinfo':
                await handleUserInfo(interaction);
                break;
            case 'serverinfo':
                await handleServerInfo(interaction);
                break;
            case 'roleinfo':
                await handleRoleInfo(interaction);
                break;
            case 'embed':
                await handleEmbed(interaction);
                break;
            case 'announce':
                await handleAnnounce(interaction);
                break;
            case 'giveaway':
                await handleGiveaway(interaction);
                break;
            case 'poll':
                await handlePoll(interaction);
                break;
            case 'stats':
                await handleStats(interaction);
                break;
            case 'ping':
                await handlePing(interaction);
                break;
            case 'help':
                await handleHelp(interaction);
                break;
        }
    }
});

// Command handlers
async function handleSetup(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: '❌ Only administrators can setup systems!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const system = interaction.options.getString('system');
    
    switch (system) {
        case 'panel':
            await setupControlPanel(interaction);
            break;
        case 'applications':
            await setupApplications(interaction);
            break;
    }
}

async function setupControlPanel(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎛️ RuzySoft Control Panel')
        .setDescription('Manage your server with advanced tools')
        .setColor('#7c3aed')
        .addFields(
            { name: '🛡️ Moderation', value: 'Ban, Kick, Timeout, Warn', inline: true },
            { name: '🔧 Management', value: 'Lock, Purge, Slowmode', inline: true },
            { name: '👤 User Management', value: 'Roles, Nicknames, Info', inline: true },
            { name: '📢 Announcements', value: 'Create embeds & polls', inline: true },
            { name: '🎉 Giveaways', value: 'Create and manage giveaways', inline: true },
            { name: '📊 Statistics', value: 'Server & user analytics', inline: true }
        )
        .setFooter({ 
            text: 'RuzySoft | Premium Services',
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('mod_menu')
                .setLabel('🛡️ Moderation')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('mgmt_menu')
                .setLabel('🔧 Management')
                .setStyle(ButtonStyle.Primary)
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('user_menu')
                .setLabel('👤 Users')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('util_menu')
                .setLabel('⚙️ Utilities')
                .setStyle(ButtonStyle.Secondary)
        );
    
    await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    
    await interaction.reply({
        content: '✅ Control panel setup complete!',
        flags: MessageFlags.Ephemeral
    });
}

async function setupApplications(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎟️ RuzySoft Applications')
        .setDescription('Apply for staff positions or partnerships')
        .setColor('#10b981')
        .addFields(
            { 
                name: '👨‍💼 Staff Application', 
                value: 'Apply for moderator or administrator position' 
            },
            { 
                name: '🤝 Partnership', 
                value: 'Apply for server partnership' 
            },
            { 
                name: '📺 Content Creator', 
                value: 'Apply for content creator role' 
            },
            { 
                name: '🔧 Developer', 
                value: 'Apply for developer position' 
            }
        )
        .setFooter({ 
            text: 'RuzySoft | Applications System',
            iconURL: config.branding.icon
        });
    
    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('application_select')
                .setPlaceholder('Select application type...')
                .addOptions([
                    {
                        label: 'Staff Application',
                        description: 'Apply for staff position',
                        value: 'staff_app',
                        emoji: '👨‍💼'
                    },
                    {
                        label: 'Partnership',
                        description: 'Apply for partnership',
                        value: 'partner_app',
                        emoji: '🤝'
                    },
                    {
                        label: 'Content Creator',
                        description: 'Apply for creator role',
                        value: 'creator_app',
                        emoji: '📺'
                    },
                    {
                        label: 'Developer',
                        description: 'Apply for developer position',
                        value: 'dev_app',
                        emoji: '🔧'
                    }
                ])
        );
    
    await interaction.channel.send({ embeds: [embed], components: [row] });
    
    await interaction.reply({
        content: '✅ Applications system setup complete!',
        flags: MessageFlags.Ephemeral
    });
}

async function handleBan(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const days = interaction.options.getInteger('days') || 0;
    
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: '❌ Only administrators can ban users!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await interaction.guild.members.ban(user, { 
            reason: `By ${interaction.user.tag}: ${reason}`,
            deleteMessageSeconds: days * 86400
        });
        
        logAction('Ban', user, interaction.user, { reason, days });
        
        const embed = new EmbedBuilder()
            .setTitle('🔨 User Banned')
            .setColor('#ef4444')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})` },
                { name: 'Moderator', value: interaction.user.tag },
                { name: 'Reason', value: reason },
                { name: 'Messages Deleted', value: `${days} days` }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to ban user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUnban(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: '❌ Only administrators can unban users!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await interaction.guild.members.unban(userId, `By ${interaction.user.tag}: ${reason}`);
        
        logAction('Unban', { id: userId }, interaction.user, { reason });
        
        await interaction.reply({
            content: `✅ **${userId}** has been unbanned!\n**Reason:** ${reason}`
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to unban user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleKick(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to kick users!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await interaction.guild.members.kick(user, `By ${interaction.user.tag}: ${reason}`);
        
        logAction('Kick', user, interaction.user, { reason });
        
        const embed = new EmbedBuilder()
            .setTitle('👢 User Kicked')
            .setColor('#f59e0b')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})` },
                { name: 'Staff', value: interaction.user.tag },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to kick user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleWarn(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to warn users!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (!db.warnings[user.id]) {
        db.warnings[user.id] = [];
    }
    
    db.warnings[user.id].push({
        reason,
        staff: interaction.user.tag,
        timestamp: Date.now()
    });
    
    logAction('Warning', user, interaction.user, { reason });
    
    const warnCount = db.warnings[user.id].length;
    const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setColor('#fbbf24')
        .addFields(
            { name: 'User', value: `${user.tag} (${user.id})` },
            { name: 'Staff', value: interaction.user.tag },
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: warnCount.toString() }
        )
        .setTimestamp();
    
    if (warnCount >= config.warnThreshold) {
        embed.addFields({
            name: '⚠️ Warning Threshold Reached',
            value: `User has reached ${config.warnThreshold} warnings!`
        });
    }
    
    await interaction.reply({ embeds: [embed] });
}

async function handleWarnings(interaction) {
    const user = interaction.options.getUser('user');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to view warnings!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const warnings = db.warnings[user.id] || [];
    
    if (warnings.length === 0) {
        return interaction.reply({
            content: `✅ **${user.tag}** has no warnings.`
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`📝 ${user.tag}'s Warning History`)
        .setColor('#f59e0b')
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Total warnings: ${warnings.length}` });
    
    warnings.forEach((warn, index) => {
        embed.addFields({
            name: `Warning #${index + 1}`,
            value: `**Reason:** ${warn.reason}\n**Staff:** ${warn.staff}\n**Time:** <t:${Math.floor(warn.timestamp/1000)}:R>`,
            inline: false
        });
    });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleClearWarns(interaction) {
    const user = interaction.options.getUser('user');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to clear warnings!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const warnCount = (db.warnings[user.id] || []).length;
    delete db.warnings[user.id];
    
    logAction('Clear Warnings', user, interaction.user, { count: warnCount });
    
    await interaction.reply({
        content: `✅ Cleared ${warnCount} warnings from **${user.tag}**.`
    });
}

async function handleTimeout(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to timeout users!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const ms = parseDuration(duration);
    if (!ms || ms > 2419200000) { // Max 28 days
        return interaction.reply({
            content: '❌ Invalid duration! Use format: 60s, 30m, 2h, 1d',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.timeout(ms, `By ${interaction.user.tag}: ${reason}`);
        
        logAction('Timeout', user, interaction.user, { reason, duration: formatDuration(ms) });
        
        const embed = new EmbedBuilder()
            .setTitle('⏰ User Timed Out')
            .setColor('#8b5cf6')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})` },
                { name: 'Staff', value: interaction.user.tag },
                { name: 'Duration', value: formatDuration(ms) },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to timeout user!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUntimeout(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to remove timeouts!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.timeout(null, `By ${interaction.user.tag}: ${reason}`);
        
        logAction('Untimeout', user, interaction.user, { reason });
        
        await interaction.reply({
            content: `✅ **${user.tag}'s** timeout has been removed!\n**Reason:** ${reason}`
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to remove timeout!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePurge(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to purge messages!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const messages = await interaction.channel.messages.fetch({ limit: amount });
        const filtered = user ? messages.filter(m => m.author.id === user.id) : messages;
        
        await interaction.channel.bulkDelete(filtered, true);
        
        logAction('Purge', interaction.user, interaction.user, { 
            amount: filtered.size,
            channel: interaction.channel.name 
        });
        
        await interaction.editReply({
            content: `✅ Deleted ${filtered.size} messages${user ? ` from ${user.tag}` : ''}.`
        });
    } catch (error) {
        await interaction.editReply({
            content: '❌ Failed to delete messages!'
        });
    }
}

async function handleLock(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to lock channels!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await channel.permissionOverwrites.edit(interaction.guild.id, {
            SendMessages: false
        });
        
        const embed = new EmbedBuilder()
            .setTitle('🔒 Channel Locked')
            .setColor('#ef4444')
            .setDescription(`${channel} has been locked by ${interaction.user}`)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        await interaction.reply({
            content: `✅ ${channel} has been locked!`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to lock channel!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUnlock(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to unlock channels!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await channel.permissionOverwrites.edit(interaction.guild.id, {
            SendMessages: true
        });
        
        await interaction.reply({
            content: `✅ ${channel} has been unlocked!`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to unlock channel!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSlowmode(interaction) {
    const duration = interaction.options.getInteger('duration');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to set slowmode!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        await channel.setRateLimitPerUser(duration);
        
        const message = duration === 0 ? 
            `✅ Slowmode disabled in ${channel}` : 
            `✅ Slowmode set to ${duration} seconds in ${channel}`;
        
        await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to set slowmode!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleNick(interaction) {
    const user = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to change nicknames!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.setNickname(nickname);
        
        await interaction.reply({
            content: `✅ **${user.tag}'s** nickname changed to **${nickname}**`
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to change nickname!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleAddRole(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to add roles!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(role);
        
        await interaction.reply({
            content: `✅ Added **${role.name}** role to **${user.tag}**`
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to add role!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveRole(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to remove roles!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.remove(role);
        
        await interaction.reply({
            content: `✅ Removed **${role.name}** role from **${user.tag}**`
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to remove role!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUserInfo(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    
    const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setColor('#3b82f6')
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
            { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
            { name: 'Roles', value: member.roles.cache.size > 1 ? 
                member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join(' ') : 'None', inline: false },
            { name: 'Highest Role', value: member.roles.highest.toString(), inline: true },
            { name: 'Boosting Since', value: member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp/1000)}:R>` : 'Not Boosting', inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
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
            { name: '💎 Boost Tier', value: `Tier ${guild.premiumTier}`, inline: true }
        )
        .setFooter({ text: `Server ID: ${guild.id}` })
        .setTimestamp();
    
    if (guild.banner) {
        embed.setImage(guild.bannerURL({ size: 512 }));
    }
    
    await interaction.reply({ embeds: [embed] });
}

async function handleRoleInfo(interaction) {
    const role = interaction.options.getRole('role');
    
    const embed = new EmbedBuilder()
        .setTitle(`🎭 ${role.name}`)
        .setColor(role.color || '#99aab5')
        .addFields(
            { name: 'ID', value: role.id, inline: true },
            { name: 'Color', value: role.hexColor, inline: true },
            { name: 'Position', value: role.position.toString(), inline: true },
            { name: 'Members', value: role.members.size.toString(), inline: true },
            { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
            { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp/1000)}:R>`, inline: true },
            { name: 'Permissions', value: role.permissions.toArray().length > 0 ? 
                role.permissions.toArray().slice(0, 10).join(', ') + (role.permissions.toArray().length > 10 ? '...' : '') : 'None' }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleEmbed(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || config.embedColor;
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to create embeds!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    await interaction.reply({
        content: `✅ Embed sent to ${channel}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleAnnounce(interaction) {
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to make announcements!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const ping = interaction.options.getRole('ping');
    
    const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setColor('#10b981')
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    let content = ping ? `${ping}` : '';
    
    await interaction.reply({ content, embeds: [embed] });
}

async function handleGiveaway(interaction) {
    if (!isStaff(interaction.member)) {
        return interaction.reply({
            content: '❌ You do not have permission to create giveaways!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const prize = interaction.options.getString('prize');
    const duration = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners');
    
    const ms = parseDuration(duration);
    if (!ms) {
        return interaction.reply({
            content: '❌ Invalid duration! Use format: 1h, 2d, 3w',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const endTime = Date.now() + ms;
    
    const embed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime/1000)}:R> (<t:${Math.floor(endTime/1000)}:F>)`)
        .setColor('#fbbf24')
        .setFooter({ text: `Hosted by ${interaction.user.tag}` })
        .setTimestamp();
    
    const message = await interaction.reply({ 
        embeds: [embed], 
        fetchReply: true,
        content: '🎉 **GIVEAWAY** 🎉'
    });
    
    await message.react('🎉');
    
    db.giveaways.push({
        messageId: message.id,
        channelId: interaction.channel.id,
        prize,
        winners,
        endTime,
        host: interaction.user.id,
        participants: []
    });
    
    setTimeout(async () => {
        await endGiveaway(message.id);
    }, ms);
}

async function endGiveaway(messageId) {
    const giveaway = db.giveaways.find(g => g.messageId === messageId);
    if (!giveaway) return;
    
    const channel = client.channels.cache.get(giveaway.channelId);
    if (!channel) return;
    
    try {
        const message = await channel.messages.fetch(messageId);
        const reaction = message.reactions.cache.get('🎉');
        
        if (!reaction) return;
        
        const users = await reaction.users.fetch();
        const validUsers = users.filter(u => !u.bot);
        
        if (validUsers.size < giveaway.winners) {
            const embed = EmbedBuilder.from(message.embeds[0])
                .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${giveaway.winners}\n**Ended:** Not enough participants!`)
                .setColor('#ef4444');
            
            await message.edit({ embeds: [embed] });
            await message.reply('🎉 Giveaway ended with not enough participants!');
            return;
        }
        
        const winners = [];
        const userArray = Array.from(validUsers.values());
        
        for (let i = 0; i < giveaway.winners; i++) {
            const randomIndex = Math.floor(Math.random() * userArray.length);
            winners.push(userArray[randomIndex]);
            userArray.splice(randomIndex, 1);
        }
        
        const winnersText = winners.map(w => `<@${w.id}>`).join(', ');
        
        const embed = EmbedBuilder.from(message.embeds[0])
            .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnersText}\n**Ended:** <t:${Math.floor(Date.now()/1000)}:R>`)
            .setColor('#10b981');
        
        await message.edit({ embeds: [embed] });
        await message.reply(`🎉 **Giveaway Ended!**\n**Winner(s):** ${winnersText}\n**Prize:** ${giveaway.prize}`);
        
        db.giveaways = db.giveaways.filter(g => g.messageId !== messageId);
    } catch (error) {
        console.error('Error ending giveaway:', error);
    }
}

async function handlePoll(interaction) {
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',').map(o => o.trim());
    
    if (options.length < 2 || options.length > 10) {
        return interaction.reply({
            content: '❌ Poll must have 2-10 options!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    
    let description = '';
    options.forEach((option, index) => {
        description += `${emojis[index]} ${option}\n\n`;
    });
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(description)
        .setColor('#3b82f6')
        .setFooter({ text: `Poll by ${interaction.user.tag}` })
        .setTimestamp();
    
    const message = await interaction.reply({ embeds: [embed], fetchReply: true });
    
    for (let i = 0; i < options.length; i++) {
        await message.react(emojis[i]);
    }
}

async function handleStats(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📊 RuzySoft Statistics')
        .setColor('#8b5cf6')
        .addFields(
            { name: '🤖 Bot Uptime', value: formatUptime(process.uptime()), inline: true },
            { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true },
            { name: '📚 Commands', value: '35+ commands', inline: true },
            { name: '👥 Total Members', value: interaction.guild.memberCount.toString(), inline: true },
            { name: '📚 Total Channels', value: interaction.guild.channels.cache.size.toString(), inline: true },
            { name: '🎭 Total Roles', value: interaction.guild.roles.cache.size.toString(), inline: true },
            { name: '⚠️ Total Warnings', value: Object.values(db.warnings).reduce((a, b) => a + b.length, 0).toString(), inline: true },
            { name: '📝 Total Logs', value: db.logs.length.toString(), inline: true }
        )
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
        .setDescription(`**WebSocket:** ${client.ws.ping}ms\n**Bot Latency:** ${Date.now() - interaction.createdTimestamp}ms`)
        .setColor('#10b981')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction) {
    const command = interaction.options.getString('command');
    
    if (command) {
        const helpEmbed = new EmbedBuilder()
            .setTitle(`Help: /${command}`)
            .setColor('#3b82f6')
            .setDescription(getCommandHelp(command))
            .setFooter({ text: 'RuzySoft | Helper Bot' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ RuzySoft Helper - Commands')
            .setColor('#7c3aed')
            .setDescription('Complete command list for RuzySoft bot')
            .addFields(
                { 
                    name: '🛡️ Moderation', 
                    value: '`/ban` `/unban` `/kick` `/warn` `/warnings` `/clearwarns` `/timeout` `/untimeout`' 
                },
                { 
                    name: '🔧 Management', 
                    value: '`/purge` `/lock` `/unlock` `/slowmode` `/nick` `/addrole` `/removerole`' 
                },
                { 
                    name: '📊 Information', 
                    value: '`/userinfo` `/serverinfo` `/roleinfo` `/stats` `/ping`' 
                },
                { 
                    name: '📢 Announcements', 
                    value: '`/announce` `/embed` `/poll` `/giveaway`' 
                },
                { 
                    name: '⚙️ Utilities', 
                    value: '`/setup` `/help`' 
                }
            )
            .setFooter({ 
                text: 'Use /help [command] for specific command information',
                iconURL: config.branding.icon
            })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

function getCommandHelp(command) {
    const help = {
        ban: 'Ban a user from the server\n**Usage:** `/ban user: [@user] reason: [text] days: [0-7]`\n**Permissions:** Admin only',
        kick: 'Kick a user from the server\n**Usage:** `/kick user: [@user] reason: [text]`\n**Permissions:** Staff+',
        warn: 'Warn a user\n**Usage:** `/warn user: [@user] reason: [text]`\n**Permissions:** Staff+',
        purge: 'Bulk delete messages\n**Usage:** `/purge amount: [1-100] user: [@user]`\n**Permissions:** Staff+',
        timeout: 'Timeout a user\n**Usage:** `/timeout user: [@user] duration: [60s/30m/2h/1d] reason: [text]`\n**Permissions:** Staff+',
        setup: 'Setup RuzySoft systems\n**Usage:** `/setup system: [panel/applications]`\n**Permissions:** Admin only',
        announce: 'Make an announcement\n**Usage:** `/announce title: [text] message: [text] ping: [@role]`\n**Permissions:** Staff+',
        giveaway: 'Create a giveaway\n**Usage:** `/giveaway prize: [text] duration: [1h/2d] winners: [1-10]`\n**Permissions:** Staff+'
    };
    
    return help[command] || `No help found for command: ${command}`;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
}

// Start the bot
client.login(process.env.DISCORD_TOKEN);
