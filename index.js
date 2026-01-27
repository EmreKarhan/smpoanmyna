try {
    if (!globalThis.ReadableStream) {
        console.log('⚠️ ReadableStream not found, loading polyfill...');
        const { ReadableStream } = require('stream/web');
        globalThis.ReadableStream = ReadableStream;
        console.log('✅ ReadableStream polyfill loaded');
    }
} catch (error) {
    console.log('⚠️ Native ReadableStream not available, trying alternative...');
    try {
        const { ReadableStream } = require('web-streams-polyfill/ponyfill');
        globalThis.ReadableStream = ReadableStream;
        console.log('✅ web-streams-polyfill loaded');
    } catch (polyfillError) {
        console.error('❌ Failed to load ReadableStream polyfill:', polyfillError.message);
        process.exit(1);
    }
}

// Discord.js ve diğer kütüphaneleri yükle
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, MessageFlags, ActivityType } = require('discord.js');
const fs = require('fs');

// LOAD CONFIG WITH ERROR HANDLING
let config;
try {
    console.log('📁 Loading config file...');
    const configData = fs.readFileSync('./config.json', 'utf8');
    config = JSON.parse(configData);
    
    // DEBUG: Check config content
    console.log('✅ Config loaded');
    
    // Ensure adminRoles is always an array
    if (!config.adminRoles) {
        config.adminRoles = [];
    } else if (!Array.isArray(config.adminRoles)) {
        config.adminRoles = [config.adminRoles];
    }
    
    // Set default values
    if (!config.embedColor) config.embedColor = '#7c3aed';
    if (!config.branding) config.branding = {};
    if (!config.branding.footer) config.branding.footer = 'RuzySoft | Premium Services';
    if (!config.branding.icon) config.branding.icon = 'https://cdn.discordapp.com/attachments/1462207492275572883/1462402361761730602/391a9977-1ccc-4749-be4c-f8cdfd572f6e.png';
    
} catch (error) {
    console.error('❌ Error loading config:', error.message);
    
    // Default config
    config = {
        guildId: "1462207490719748250",
        ownerId: "741753240827461672",
        adminRoles: ["1462207491063419108"],
        logChannelId: "1460734266236211314",
        embedColor: "#7c3aed",
        branding: {
            name: "RuzySoft",
            icon: "https://cdn.discordapp.com/attachments/1462207492275572883/1462402361761730602/391a9977-1ccc-4749-be4c-f8cdfd572f6e.png",
            footer: "RuzySoft | Premium Services"
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
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// DATABASE
const db = {
    warnings: {},
    logs: [],
    giveaways: [],
    applications: [],
    polls: []
};

// STATUS VARIABLES
let statusIndex = 0;
const statusMessages = [
    { 
        text: "discord.gg/pnTjcgSAMB", 
        type: ActivityType.Watching
    },
    { 
        text: "RUZYSOFT.NET", 
        type: ActivityType.Watching
    }
];

// ADMIN CHECK FUNCTION
function isAdmin(member) {
    try {
        if (!member) return false;
        
        // Admin permission check
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            return true;
        }
        
        // Check admin roles from config
        if (config.adminRoles && Array.isArray(config.adminRoles)) {
            for (const roleId of config.adminRoles) {
                if (member.roles.cache.has(roleId)) {
                    return true;
                }
            }
        }
        
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
                
                for (const [key, value] of Object.entries(details)) {
                    if (value) embed.addFields({ name: key, value: String(value), inline: true });
                }
                
                logChannel.send({ embeds: [embed] }).catch(() => {});
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
        
        client.user.setPresence({
            status: 'dnd', 
            activities: [{
                name: status.text,
                type: status.type
            }]
        });
        
        console.log(`🔄 Status updated: ${status.text}`);
        
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
    console.log(`📊 Guild: ${client.guilds.cache.first()?.name || 'Unknown'}`);
    console.log(`🎯 Guild ID: ${config.guildId}`);
    console.log(`👑 Admin Roles: ${config.adminRoles.join(', ') || 'Not defined'}`);
    console.log(`✨ ================================= ✨\n`);
    
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
        console.error(`❌ Guild not found!`);
        return;
    }
    
    // SET INITIAL STATUS
    updateStatus();
    
    // UPDATE STATUS EVERY 10 SECONDS
    setInterval(updateStatus, 10000);
    
    // SLASH COMMANDS - FULL SET
    const commands = [
        // HELP
        {
            name: 'help',
            description: 'Show help menu'
        },
        
        // PANEL
        {
            name: 'panel',
            description: 'Create admin control panel'
        },
        
        // MODERATION
        {
            name: 'ban',
            description: 'Ban a user from the server',
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
            description: 'Kick a user from the server',
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
            description: 'Remove timeout from user',
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
            name: 'purge',
            description: 'Delete multiple messages',
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
            description: 'Lock the current channel'
        },
        {
            name: 'unlock',
            description: 'Unlock the current channel'
        },
        
        // MANAGEMENT
        {
            name: 'addrole',
            description: 'Add role to user',
            options: [
                {
                    name: 'user',
                    description: 'User',
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
                    description: 'User',
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
            name: 'nick',
            description: 'Change user nickname',
            options: [
                {
                    name: 'user',
                    description: 'User',
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
        
        // INFORMATION
        {
            name: 'userinfo',
            description: 'Get user information',
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
            description: 'Get server information'
        },
        {
            name: 'roleinfo',
            description: 'Get role information',
            options: [
                {
                    name: 'role',
                    description: 'Role',
                    type: 8,
                    required: true
                }
            ]
        },
        
        // ANNOUNCEMENTS
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
            name: 'embed',
            description: 'Create custom embed',
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
                }
            ]
        },
        
        // GIVEAWAYS
        {
            name: 'giveaway',
            description: 'Create a giveaway',
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
        
        // POLLS
        {
            name: 'poll',
            description: 'Create a poll',
            options: [
                {
                    name: 'question',
                    description: 'Poll question',
                    type: 3,
                    required: true
                },
                {
                    name: 'option1',
                    description: 'Option 1',
                    type: 3,
                    required: true
                },
                {
                    name: 'option2',
                    description: 'Option 2',
                    type: 3,
                    required: true
                },
                {
                    name: 'option3',
                    description: 'Option 3',
                    type: 3,
                    required: false
                },
                {
                    name: 'option4',
                    description: 'Option 4',
                    type: 3,
                    required: false
                }
            ]
        },
        
        // UTILITIES
        {
            name: 'ping',
            description: 'Check bot latency'
        },
        {
            name: 'stats',
            description: 'Show bot statistics'
        },
        {
            name: 'setup',
            description: 'Setup systems',
            options: [
                {
                    name: 'system',
                    description: 'System to setup',
                    type: 3,
                    required: true,
                    choices: [
                        { name: '🎛️ Control Panel', value: 'panel' },
                        { name: '🎟️ Applications', value: 'applications' },
                        { name: '📢 Announcements', value: 'announcements' }
                    ]
                }
            ]
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
            return interaction.reply({
                content: '❌ **Permission Denied!** Only administrators can use these commands.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // COMMAND ROUTING
        switch (commandName) {
            case 'help':
                await handleHelp(interaction);
                break;
            case 'panel':
                await handlePanel(interaction);
                break;
            case 'setup':
                await handleSetup(interaction);
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
            case 'clearwarns':
                await handleClearWarns(interaction);
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
            case 'addrole':
                await handleAddRole(interaction);
                break;
            case 'removerole':
                await handleRemoveRole(interaction);
                break;
            case 'nick':
                await handleNick(interaction);
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
            case 'announce':
                await handleAnnounce(interaction);
                break;
            case 'embed':
                await handleEmbed(interaction);
                break;
            case 'giveaway':
                await handleGiveaway(interaction);
                break;
            case 'poll':
                await handlePoll(interaction);
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
        
        await interaction.reply({
            content: '❌ An error occurred! Please try again later.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
});

// ============ COMMAND HANDLERS ============

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🛠️ RuzySoft Admin Bot - Help')
        .setColor(config.embedColor)
        .setDescription('**Commands available only to administrators:**')
        .addFields(
            { 
                name: '🛡️ Moderation', 
                value: '`/ban` `/kick` `/timeout` `/untimeout`\n`/warn` `/warnings` `/clearwarns` `/purge`\n`/lock` `/unlock`' 
            },
            { 
                name: '👤 Management', 
                value: '`/addrole` `/removerole` `/nick`' 
            },
            { 
                name: '📊 Information', 
                value: '`/userinfo` `/serverinfo` `/roleinfo`' 
            },
            { 
                name: '📢 Announcements', 
                value: '`/announce` `/embed`' 
            },
            { 
                name: '🎉 Fun & Games', 
                value: '`/giveaway` `/poll`' 
            },
            { 
                name: '⚙️ Utilities', 
                value: '`/panel` `/setup` `/ping` `/stats` `/help`' 
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
            { name: '👤 Management', value: 'Roles, Nicknames, Permissions', inline: true },
            { name: '📊 Information', value: 'User & Server Stats', inline: true },
            { name: '📢 Announcements', value: 'Embeds, Giveaways, Polls', inline: true },
            { name: '⚙️ Utilities', value: 'Setup, Logs, Settings', inline: true }
        )
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('mod_panel')
                .setLabel('🛡️ Moderation')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('mgmt_panel')
                .setLabel('👤 Management')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('info_panel')
                .setLabel('📊 Information')
                .setStyle(ButtonStyle.Success)
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('announce_panel')
                .setLabel('📢 Announcements')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('util_panel')
                .setLabel('⚙️ Utilities')
                .setStyle(ButtonStyle.Secondary)
        );
    
    await interaction.reply({ 
        content: '**Admin Panel Created!**',
        embeds: [embed], 
        components: [row1, row2] 
    });
}

async function handleSetup(interaction) {
    const system = interaction.options.getString('system');
    
    if (system === 'panel') {
        await handlePanel(interaction);
    } else if (system === 'applications') {
        await setupApplications(interaction);
    } else if (system === 'announcements') {
        await setupAnnouncements(interaction);
    }
}

async function setupApplications(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎟️ RuzySoft Applications')
        .setColor('#10b981')
        .setDescription('Apply for various positions within RuzySoft')
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
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
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

async function setupAnnouncements(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📢 Announcement Channel')
        .setColor('#fbbf24')
        .setDescription('This is the official announcement channel for RuzySoft.\n\nAll important updates, giveaways, and news will be posted here.')
        .addFields(
            { name: '📢 Updates', value: 'Product updates and news' },
            { name: '🎉 Giveaways', value: 'Weekly giveaways and contests' },
            { name: '📅 Events', value: 'Server events and activities' },
            { name: '🆕 Releases', value: 'New product releases' }
        )
        .setFooter({ 
            text: config.branding.footer,
            iconURL: config.branding.icon
        })
        .setTimestamp();
    
    await interaction.channel.send({ embeds: [embed] });
    
    await interaction.reply({
        content: '✅ Announcement channel setup complete!',
        flags: MessageFlags.Ephemeral
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

async function handleClearWarns(interaction) {
    const user = interaction.options.getUser('user');
    const warnCount = (db.warnings[user.id] || []).length;
    
    delete db.warnings[user.id];
    
    logAction('Clear Warnings', user, interaction.user, { count: warnCount });
    
    await interaction.reply({
        content: `✅ Cleared ${warnCount} warnings from **${user.tag}**.`
    });
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
        await interaction.reply({
            content: '❌ Failed to unlock channel!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleAddRole(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    
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

async function handleNick(interaction) {
    const user = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname');
    
    try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.setNickname(nickname);
        
        await interaction.reply({
            content: `✅ **${user.tag}** nickname changed to **${nickname}**`
        });
        
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to change nickname!',
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

async function handleRoleInfo(interaction) {
    const role = interaction.options.getRole('role');
    
    const embed = new EmbedBuilder()
        .setTitle(`🎭 ${role.name}`)
        .setColor(role.color || '#99aab5')
        .addFields(
            { name: '🆔 ID', value: role.id, inline: true },
            { name: '🎨 Color', value: role.hexColor, inline: true },
            { name: '📊 Position', value: role.position.toString(), inline: true },
            { name: '👥 Members', value: role.members.size.toString(), inline: true },
            { name: '📍 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
            { name: '⬆️ Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(role.createdTimestamp/1000)}:R>`, inline: true }
        )
        .setFooter({ text: `Requested by: ${interaction.user.tag}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleAnnounce(interaction) {
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
    
    const content = ping ? `${ping}` : '';
    
    await interaction.reply({ content, embeds: [embed] });
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

async function handleGiveaway(interaction) {
    const prize = interaction.options.getString('prize');
    const duration = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners');
    
    const ms = parseDuration(duration);
    if (!ms) {
        return interaction.reply({
            content: '❌ Invalid duration! Usage: 1h, 2d',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const endTime = Date.now() + ms;
    
    const embed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime/1000)}:R>`)
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
        host: interaction.user.id
    });
    
    // End giveaway after duration
    setTimeout(async () => {
        await endGiveaway(message.id);
    }, ms);
}

async function endGiveaway(messageId) {
    const giveaway = db.giveaways.find(g => g.messageId === messageId);
    if (!giveaway) return;
    
    try {
        const channel = client.channels.cache.get(giveaway.channelId);
        if (!channel) return;
        
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
    const options = [
        interaction.options.getString('option1'),
        interaction.options.getString('option2'),
        interaction.options.getString('option3'),
        interaction.options.getString('option4')
    ].filter(opt => opt);
    
    if (options.length < 2) {
        return interaction.reply({
            content: '❌ Poll must have at least 2 options!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    
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
            { name: '🔄 Command Count', value: '30+', inline: true }
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
console.log('🚀 Starting RuzySoft Bot...');
client.login(process.env.DISCORD_TOKEN);
