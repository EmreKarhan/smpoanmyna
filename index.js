const {Client,GatewayIntentBits,EmbedBuilder,ActionRowBuilder,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionFlagsBits,ChannelType,ButtonBuilder,ButtonStyle,AttachmentBuilder,MessageFlags} = require('discord.js');

const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

let ticketData = {};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

function hasSupportPermission(member) {
    return config.ticketRoleId.some(roleId =>
        member.roles.cache.has(roleId)
    );
}

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} olarak giriş yaptı!`);

    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    await guild.commands.set([]);

    await guild.commands.create({
        name: 'ticketcreate',
        description: 'Sends the ticket panel to the selected channel',
        options: [
            {
                name: 'kanal',
                description: 'Channel to which the ticket panel will be sent',
                type: 7, // CHANNEL
                required: true
            }
        ]
    });

    await guild.commands.create({
        name: 'logayarla',
        description: 'Configure the log channel',
        options: [{
            name: 'kanal',
            description: 'Select the log channel',
            type: 7,
            required: true
        }]
    });

    await guild.commands.create({
        name: 'logsıfırla',
        description: 'Resets the log channel'
    });

    console.log('✅ Slash commands loaded!');
});

client.on('interactionCreate', async interaction => {

    if (interaction.isChatInputCommand()) {

        if (interaction.user.id !== config.ownerId) {
            return interaction.reply({
                content: '❌ Only the server owner can use this command!',
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.commandName === 'ticketcreate')
            return handleTicketCommand(interaction);

        if (interaction.commandName === 'logayarla')
            return handleLogSetup(interaction);

        if (interaction.commandName === 'logsıfırla')
            return handleLogReset(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category')
        return handleCategorySelection(interaction);

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_'))
        return handleModalSubmit(interaction);

    if (interaction.isButton()) {
        if (interaction.customId === 'close_ticket') return handleTicketClose(interaction);
        if (interaction.customId === 'confirm_close') return handleTicketCloseConfirm(interaction);
        if (interaction.customId === 'cancel_close') return handleTicketCloseCancel(interaction);
    }
});

async function handleLogSetup(interaction) {
    const channel = interaction.options.getChannel('kanal');
    
    config.logChannelId = channel.id;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Log Channel Set')
        .setDescription(`Log channel has been set to ${channel}.`)
        .setColor('#00ff00')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleLogReset(interaction) {
    config.logChannelId = "";
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Log Channel Reset')
        .setDescription('Log channel has been reset. Ticket logs will no longer be sent.')
        .setColor('#ff9900')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleTicketCommand(interaction) {

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const targetChannel = interaction.options.getChannel('kanal');

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        return interaction.editReply({
            content: '❌ Please select a valid text channel!'
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('RuzySoft Tickets')
        .setDescription(
            `We've provided an option for any problems you encounter or situations you wish to report to us; please select it!
        
📌 If incomplete or incorrect information is leaked or filled out, the ticket will be closed immediately.`
        )
        .setColor('#73ff00')
        .setFooter({
            text: 'RuzySoft Revolution - Ticket System',
            iconURL: 'https://cdn.discordapp.com/attachments/1337564450600910858/1460716091327254629/0b8e5a2c-1eff-414c-858c-b8af487e6111.png?ex=6967ed5e&is=69669bde&hm=2d42e3861eec9f9fbc767cfcdda36edd3c61ca96582467eac820b01461e494af&'
        })
        .setImage('https://media.discordapp.net/attachments/1337564450600910858/1460731600479453355/6e357873-fb9e-43a5-94fe-ccbaa12c56e2.png?ex=6967fbd0&is=6966aa50&hm=ef10e5cd1eaa04b2313f955fe4d43d8fc39789a92aafd6a66a50fc6015888345&=&format=webp&quality=lossless&width=1376&height=917')
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Select a category')
        .addOptions(
            Object.entries(config.categories).map(([key, c]) => ({
                label: c.name,
                description: c.description,
                value: key,
                emoji: c.emoji
            }))
        );

    await targetChannel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)]
    });

    await interaction.editReply({
        content: `✅ Ticket panel sent to the ${targetChannel} channel.`
    });
}

async function handleCategorySelection(interaction) {
    const selectedCategory = interaction.values[0];
    const category = config.categories[selectedCategory];

    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${selectedCategory}`)
        .setTitle(`${category.name} - Create Ticket`);

    let questions = [];
    
    switch (selectedCategory) {

    case 'payment':
        questions = [
            {
                label: 'Username',
                placeholder: 'Your username on the site',
                required: true
            },
            {
                label: 'Product Name',
                placeholder: 'Please enter the name of the product you wish to purchase!',
                required: true
            },
            {
                label: 'Payment Method',
                placeholder: 'Credit Card, Crypto, EFT, etc.',
                required: true
            }
        ];
        break;

    case 'support':
        questions = [
            {
                label: 'Username',
                placeholder: 'Your username on the site',
                required: true
            },
            {
                label: 'Related Product / Service',
                placeholder: 'Select the product or service you need help with',
                required: true
            },
            {
                label: 'Issue Description',
                placeholder: 'Please describe your issue in detail so we can assist you faster...',
                required: true,
                style: TextInputStyle.Paragraph
            }
        ];
        break;

    case 'reseller':
        questions = [
            {
                label: 'Username',
                placeholder: 'Your username on the site',
                required: true
            },
            {
                label: 'Business / Brand Name',
                placeholder: 'Your business name or brand',
                required: true
            },
            {
                label: 'Expected Monthly Sales',
                placeholder: 'Estimated monthly sales volume',
                required: true
            },
            {
                label: 'Previous Reseller Experience',
                placeholder: 'Describe your previous reseller experience (if any)',
                required: true,
                style: TextInputStyle.Paragraph
            }
        ];
        break;

    case 'media':
        questions = [
            {
                label: 'Social Media Profile',
                placeholder: 'TikTok / YouTube / Instagram profile link',
                required: true
            },
            {
                label: 'Username',
                placeholder: 'Your username on the site',
                required: true
            },
            {
                label: 'Video URL',
                placeholder: 'Paste the video URL (Required)',
                required: true
            },
            {
                label: 'Collaboration Proposal',
                placeholder: 'Explain what kind of collaboration you are looking for',
                required: true,
                style: TextInputStyle.Paragraph
            }
        ];
        break;

    case 'hwid':
        questions = [
            {
                label: 'Username',
                placeholder: 'Your username on the site',
                required: true
            },
            {
                label: 'Product Key',
                placeholder: 'Enter your valid product key',
                required: true
            },
            {
                label: 'HWID Reset Reason',
                placeholder: 'Explain why you are requesting an HWID reset',
                required: true,
                style: TextInputStyle.Paragraph
            }
        ];
        break;
    }   


    questions.forEach((q, index) => {
        const textInput = new TextInputBuilder()
            .setCustomId(`question_${index}`)
            .setLabel(q.label)
            .setPlaceholder(q.placeholder)
            .setRequired(q.required)
            .setStyle(q.style || TextInputStyle.Short);
        
        const actionRow = new ActionRowBuilder().addComponents(textInput);
        modal.addComponents(actionRow);
    });

    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {

    const categoryKey = interaction.customId.split('_')[2];
    const category = config.categories[categoryKey];
    const guild = interaction.guild;
    const user = interaction.user;

    const active = Object.values(ticketData)
        .find(t => t.userId === user.id && t.status === 'open');

    if (active) {
        return interaction.reply({
            content: '❌ You already have an active ticket!',
            flags: MessageFlags.Ephemeral
        });
    }

    const safeName = user.username.replace(/[^a-zA-Z0-9-_]/g, '');
    const ticketId = `${categoryKey}-${safeName}`;

    const channel = await guild.channels.create({
        name: ticketId,
        type: ChannelType.GuildText,
        parent: config.ticketCategoryId,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            ...config.ticketRoleId.map(r => ({
                id: r,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            }))
        ]
    });

    ticketData[channel.id] = {
        id: ticketId,           
        userId: user.id,
        username: user.username,
        category: categoryKey,
        createdAt: Date.now(),
        status: 'open'
    };

    const ticketEmbed = new EmbedBuilder()
    .setTitle(`${category.name} Ticket`)
    .setDescription(
        `**Ticket Owner:** ${user.username}\n` +
        `**Category:** ${category.name}\n` +
        `**Created:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
        `**Info:** Our representative will assist you when they are available. I wish you patience.`
    )
    .setColor(config.embedColor)
    .setFooter({
        text: 'RuzySoft Revolution - Ticket System',
        iconURL: 'https://cdn.discordapp.com/attachments/1337564450600910858/1460716091327254629/0b8e5a2c-1eff-414c-858c-b8af487e6111.png?ex=6967ed5e&is=69669bde&hm=2d42e3861eec9f9fbc767cfcdda36edd3c61ca96582467eac820b01461e494af&'
    })
    .setImage('https://media.discordapp.net/attachments/1337564450600910858/1460731600479453355/6e357873-fb9e-43a5-94fe-ccbaa12c56e2.png?ex=6967fbd0&is=6966aa50&hm=ef10e5cd1eaa04b2313f955fe4d43d8fc39789a92aafd6a66a50fc6015888345&=&format=webp&quality=lossless&width=1376&height=917')
    .setTimestamp();

    let questions = [];

    switch (categoryKey) {
        case 'payment':
            questions = ['Username', 'Product', 'Payment Method'];
            break;
        case 'support':
            questions = ['Username', 'Related Product / Service', 'Issue Description?'];
            break;
        case 'reseller':
            questions = ['Username', 'Business / Brand Name', 'Expected Monthly Sales', 'Previous Reseller Experience?'];
            break;
        case 'media':
            questions = ['Social Media Profile', 'Username', 'Video URL', 'Collaboration Proposal?'];
            break;
        case 'hwid':
            questions = ['Username', 'Product Key', 'HWID Reset Reason?'];
            break;
    }

    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`question_${i}`);
        if (!answer) continue;

        ticketEmbed.addFields({
            name: questions[i],
            value: `\`\`\`\n${answer}\n\`\`\``,
            inline: false
        });
    }

    const closeBtn = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('🔒 Close Ticket')
        .setStyle(ButtonStyle.Danger);

    await channel.send({
        embeds: [ticketEmbed],
        components: [new ActionRowBuilder().addComponents(closeBtn)]
    });

    await interaction.reply({
        content: `✅ Ticket created: ${channel}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleTicketClose(interaction) {
    const channel = interaction.channel;
    const user = interaction.user;

    if (!ticketData[channel.id]) {
        return await interaction.reply({
            content: '❌ This is not a ticket channel!',
            flags: MessageFlags.Ephemeral
        });
    }

    if (user.id !== config.ownerId) {
        return await interaction.reply({
            content: '❌ Only the server owner can close tickets!',
            flags: MessageFlags.Ephemeral
        });
    }

    const confirmEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Close Confirmation')
        .setDescription(
            'Are you sure you want to close this ticket?\n\n' +
            '**Note:** A transcript will be created and sent to the log channel.'
        )
        .setColor('#ff9900')
        .setTimestamp();

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_close')
        .setLabel('✅ Yes, Close')
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_close')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary);

    await interaction.reply({
        embeds: [confirmEmbed],
        components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)],
        flags: MessageFlags.Ephemeral
    });
}

async function handleTicketCloseConfirm(interaction) {
    const channel = interaction.channel;
    const user = interaction.user;
    const guild = interaction.guild;
    
    const ticketInfo = ticketData[channel.id];
    if (!ticketInfo) {
        return await interaction.reply({
            content: '❌ Ticket information not found!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await interaction.reply({
        content: '🔄 Ticket is being closed and transcript is being created...',
        flags: MessageFlags.Ephemeral
    });
    
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        let transcript = `TICKET LOG\n`;
        transcript += `================\n`;
        transcript += `Opened by: ${ticketInfo.username} (${ticketInfo.userId})\n`;
        transcript += `Closed by: ${user.username} (${user.id})\n`;
        transcript += `Created at: ${new Date(ticketInfo.createdAt).toLocaleString('en-US')}\n`;
        transcript += `================\n\n`;
        
        sortedMessages.forEach(msg => {
            if (msg.content) {
                const timestamp = msg.createdAt.toLocaleString('en-US');
                transcript += `[${timestamp}] ${msg.author.username}: ${msg.content}\n`;
            }
        });
        
        const transcriptBuffer = Buffer.from(transcript, 'utf-8');
        const attachment = new AttachmentBuilder(transcriptBuffer, { 
            name: `${ticketInfo.id}-transcript.txt` 
        });
        
        if (config.logChannelId) {
            const logChannel = guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const duration = Math.floor((Date.now() - ticketInfo.createdAt) / (1000 * 60));
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Closed')
                    .addFields(
                        { name: 'Ticket ID', value: ticketInfo.id, inline: true },
                        { name: 'Ticket Owner', value: `<@${ticketInfo.userId}> (${ticketInfo.userId})`, inline: true },
                        { name: 'Closed by', value: `${user} (${user.id})`, inline: true },
                        { name: 'Category', value: config.categories[ticketInfo.category].name, inline: true },
                        { name: 'Duration', value: `${duration} minutes`, inline: true },
                        { name: 'Closed at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setColor('#ff0000')
                    .setTimestamp();
                
                await logChannel.send({ 
                    embeds: [logEmbed], 
                    files: [attachment] 
                });
            }
        }
        
        ticketData[channel.id].status = 'closed';
        ticketData[channel.id].closedAt = Date.now();
        ticketData[channel.id].closedBy = user.id;
        
        setTimeout(async () => {
            try {
                await channel.delete('Ticket closed');
            } catch (error) {
                console.error('Error while deleting channel:', error);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Error while closing ticket:', error);
        await interaction.followUp({
            content: '❌ An error occurred while closing the ticket!',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleTicketCloseCancel(interaction) {
    await interaction.update({
        content: '✅ Ticket closing operation has been cancelled.',
        embeds: [],
        components: []
    });
}

client.login(process.env.DISCORD_TOKEN);
