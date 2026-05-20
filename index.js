require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, Events
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const sessions = new Map();

const CURRENCIES = [
  { label: 'USD — US Dollar',        value: 'USD', symbol: '$',  rate: 1 },
  { label: 'EUR — Euro',             value: 'EUR', symbol: '€',  rate: 1.08 },
  { label: 'COP — Colombian Peso',   value: 'COP', symbol: '$',  rate: 0.00024 },
  { label: 'MXN — Mexican Peso',     value: 'MXN', symbol: '$',  rate: 0.058 },
  { label: 'BRL — Brazilian Real',   value: 'BRL', symbol: 'R$', rate: 0.20 },
  { label: 'ARS — Argentine Peso',   value: 'ARS', symbol: '$',  rate: 0.0011 },
  { label: 'CLP — Chilean Peso',     value: 'CLP', symbol: '$',  rate: 0.0011 },
  { label: 'PEN — Peruvian Sol',     value: 'PEN', symbol: 'S/', rate: 0.27 },
  { label: 'GBP — British Pound',    value: 'GBP', symbol: '£',  rate: 1.27 },
  { label: 'CAD — Canadian Dollar',  value: 'CAD', symbol: '$',  rate: 0.74 },
];

const PAYMENT_LABELS = {
  paypal:       { label: 'PayPal' },
  crypto:       { label: 'Crypto (USDT/BTC)' },
  nequi:        { label: 'Nequi' },
  bancolombia:  { label: 'Bancolombia' },
  daviplata:    { label: 'Daviplata' },
  mercadopago:  { label: 'Mercado Pago' },
  pix:          { label: 'PIX' },
  zinli:        { label: 'Zinli / Zelle' },
  bank:         { label: 'Bank Transfer' },
};

const T = {
  en: {
    welcome: (mention) => `Welcome ${mention}! Follow the steps below to complete your purchase.`,
    selectCurrency: 'Select your currency',
    selectCurrencyDesc: 'This determines the total amount you will pay.',
    selectCurrencyPlaceholder: 'Select your currency / country...',
    enterAmount: (title) => `How much ${title} do you want?`,
    enterAmountBtn: 'Enter amount',
    enterAmountPlaceholder: 'Enter a number...',
    amountLabel: 'Amount (e.g. 1000, 500, 250)',
    orderSummary: 'Order Summary',
    item: 'Item',
    amount: 'Amount',
    totalToPay: 'Total to Pay',
    priceFee: 'Price includes service fee.',
    selectProduct: 'Select the product you want to purchase:',
    selectProductPlaceholder: 'Select a product...',
    selectPayment: 'Choose your payment method:',
    selectPaymentPlaceholder: 'Choose your payment method...',
    payWith: (method) => `Pay with ${method}`,
    payDesc: 'Send the payment then upload a screenshot or enter your transaction ID.',
    sendTo: 'Send to',
    submitProof: 'Submit Payment Proof',
    proofModalTitle: 'Payment Confirmation',
    refLabel: 'Transaction ID / Reference (optional)',
    refPlaceholder: 'e.g. TXN123456789',
    noteLabel: 'Additional note (optional)',
    sendScreenshot: 'Now send your **payment screenshot** as an image in this channel.',
    purchaseSubmitted: 'Purchase Submitted',
    purchaseSubmittedDesc: 'Your order has been submitted and is pending verification. An admin will confirm shortly.',
    product: 'Product / Panel',
    paymentMethod: 'Payment Method',
    total: 'Total',
    adminPending: 'New Purchase — Pending Verification',
    user: 'User',
    panel: 'Panel',
    ticket: 'Ticket',
    payment: 'Payment',
    reference: 'Reference',
    note: 'Note',
    screenshot: 'Screenshot',
    approveBtn: 'Approve & Deliver',
    rejectBtn: 'Reject',
    approved: () => 'Your payment was confirmed. Items will be delivered shortly. Thank you!',
    rejected: 'Payment could not be verified. Contact an admin if this is a mistake.\n\nThis channel closes in 2 minutes.',
    orderApproved: 'Order Approved',
    orderRejected: 'Order Rejected',
    approvedBy: (mention) => `Approved by ${mention}`,
    rejectedBy: (mention) => `Rejected by ${mention}`,
    openTicket: 'Open Purchase Ticket',
    poweredBy: 'Powered by Pricey',
    alreadyOpen: (channelId) => `You already have an open ticket → <#${channelId}>`,
    ticketReady: (channelId) => `Your ticket is ready → <#${channelId}>`,
    openedBy: 'Opened by',
    closeTicket: 'Close Ticket',
    closingIn5: 'Closing ticket in 5 seconds...',
    staffOnly: 'Only staff can close tickets.',
    pleaseAttachImage: 'Please attach an image.',
    pleaseValidNumber: 'Please enter a valid positive number.',
    pleaseValidNum: 'Please enter a valid number.',
    noPaymentMethods: 'No payment methods configured. Contact an admin.',
    currencySelected: (currency) => `Currency selected: **${currency}**`,
    selectedProduct: (name, price) => `**Selected:** ${name}\n**Price:** ${price}`,
    paymentMethodSelected: (label) => `Payment method: **${label}**`,
    pleaseAttachUser: 'Please mention a valid user with @username.',
    questionRequired: 'Required',
    questionOptional: 'Optional — you can leave it blank',
    answerQuestion: 'Answer this question',
    sendImageAnswer: 'Send an image or photo as your answer.',
    mentionUserAnswer: 'Mention a user with @username',
    numbersOnly: 'Numbers only...',
    typeAnswer: 'Type your answer...',
  },
  es: {
    welcome: (mention) => `¡Bienvenido ${mention}! Sigue los pasos a continuación para completar tu compra.`,
    selectCurrency: 'Selecciona tu moneda',
    selectCurrencyDesc: 'Esto determina el monto total que pagarás.',
    selectCurrencyPlaceholder: 'Selecciona tu moneda / país...',
    enterAmount: (title) => `¿Cuánto ${title} quieres comprar?`,
    enterAmountBtn: 'Ingresar cantidad',
    enterAmountPlaceholder: 'Ingresa un número...',
    amountLabel: 'Cantidad (ej. 1000, 500, 250)',
    orderSummary: 'Resumen del Pedido',
    item: 'Artículo',
    amount: 'Cantidad',
    totalToPay: 'Total a Pagar',
    priceFee: 'El precio incluye la tarifa de servicio.',
    selectProduct: 'Selecciona el producto que deseas comprar:',
    selectProductPlaceholder: 'Selecciona un producto...',
    selectPayment: 'Elige tu método de pago:',
    selectPaymentPlaceholder: 'Elige tu método de pago...',
    payWith: (method) => `Pagar con ${method}`,
    payDesc: 'Envía el pago y luego sube una captura de pantalla o escribe tu ID de transacción.',
    sendTo: 'Enviar a',
    submitProof: 'Enviar Comprobante de Pago',
    proofModalTitle: 'Confirmación de Pago',
    refLabel: 'ID de Transacción / Referencia (opcional)',
    refPlaceholder: 'ej. TXN123456789',
    noteLabel: 'Nota adicional (opcional)',
    sendScreenshot: 'Ahora envía tu **captura de pantalla del pago** como imagen en este canal.',
    purchaseSubmitted: 'Compra Enviada',
    purchaseSubmittedDesc: 'Tu pedido fue enviado y está pendiente de verificación. Un administrador confirmará pronto.',
    product: 'Producto / Panel',
    paymentMethod: 'Método de Pago',
    total: 'Total',
    adminPending: 'Nueva Compra — Verificación Pendiente',
    user: 'Usuario',
    panel: 'Panel',
    ticket: 'Ticket',
    payment: 'Pago',
    reference: 'Referencia',
    note: 'Nota',
    screenshot: 'Captura',
    approveBtn: 'Aprobar y Entregar',
    rejectBtn: 'Rechazar',
    approved: () => '¡Tu pago fue confirmado! Los artículos se entregarán pronto. ¡Gracias!',
    rejected: 'No se pudo verificar el pago. Contacta a un administrador si crees que es un error.\n\nEste canal se cierra en 2 minutos.',
    orderApproved: 'Pedido Aprobado',
    orderRejected: 'Pedido Rechazado',
    approvedBy: (mention) => `Aprobado por ${mention}`,
    rejectedBy: (mention) => `Rechazado por ${mention}`,
    openTicket: 'Abrir Ticket de Compra',
    poweredBy: 'Powered by Pricey',
    alreadyOpen: (channelId) => `Ya tienes un ticket abierto → <#${channelId}>`,
    ticketReady: (channelId) => `Tu ticket está listo → <#${channelId}>`,
    openedBy: 'Abierto por',
    closeTicket: 'Cerrar Ticket',
    closingIn5: 'Cerrando ticket en 5 segundos...',
    staffOnly: 'Solo el staff puede cerrar tickets.',
    pleaseAttachImage: 'Por favor adjunta una imagen.',
    pleaseValidNumber: 'Por favor ingresa un número positivo válido.',
    pleaseValidNum: 'Por favor ingresa un número válido.',
    noPaymentMethods: 'No hay métodos de pago configurados. Contacta a un administrador.',
    currencySelected: (currency) => `Moneda seleccionada: **${currency}**`,
    selectedProduct: (name, price) => `**Seleccionado:** ${name}\n**Precio:** ${price}`,
    paymentMethodSelected: (label) => `Método de pago: **${label}**`,
    pleaseAttachUser: 'Por favor menciona a un usuario válido con @usuario.',
    questionRequired: 'Obligatorio',
    questionOptional: 'Opcional — puedes dejarlo en blanco',
    answerQuestion: 'Responder esta pregunta',
    sendImageAnswer: 'Envía una imagen o foto como respuesta.',
    mentionUserAnswer: 'Menciona a un usuario con @usuario',
    numbersOnly: 'Solo números...',
    typeAnswer: 'Escribe tu respuesta...',
  }
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function getLang(config) { return T[config?.language] || T.en; }

async function apiFetch(url, opts, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }
  return null;
}

async function getConfig(guildId) {
  try { const r = await apiFetch(`${BASE_URL}/internal/config/${guildId}`); return r ? r.json() : {}; }
  catch { return {}; }
}
async function getPanels(guildId) {
  try { const r = await apiFetch(`${BASE_URL}/internal/panels/${guildId}`); return r ? r.json() : []; }
  catch { return []; }
}

function reportGuildData(guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const channels   = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name }));
  const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name }));
  const roles      = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));
  apiFetch(`${BASE_URL}/api/bot-guild-data`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, data: { channels, categories, roles } })
  }).catch(() => {});
}

function sendBotStatus() {
  const guildIds = client.guilds.cache.map(g => g.id);
  apiFetch(`${BASE_URL}/api/bot-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online: true, tag: client.user.tag, guilds: guildIds })
  }).catch(() => {});
}

function syncTicket(session) {
  if (!session?.guildId || !session?.channelId) return;
  apiFetch(`${BASE_URL}/api/bot-ticket-update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guildId: session.guildId,
      ticket: {
        channelId: session.channelId,
        guildId: session.guildId,
        userId: session.userId,
        username: session.username,
        panel: session.panel,
        status: session.status || 'open',
        selectedProduct: session.selectedProduct || null,
        currencyAmount: session.currencyAmount || null,
        totalDisplay: session.totalDisplay || null,
        paymentMethod: session.paymentMethod || null,
        paymentReference: session.paymentReference || null,
        paymentNote: session.paymentNote || null,
        paymentProof: session.paymentProof || null,
        answers: session.answers || [],
        canType: session.canType || false,
        reported: session.reported || false,
        pastTickets: session.pastTickets || [],
        openedAt: session.openedAt || Date.now(),
      }
    })
  }).catch(() => {});
}

client.once(Events.ClientReady, () => {
  console.log(`Bot connected as: ${client.user.tag}`);
  setTimeout(() => {
    sendBotStatus();
    client.guilds.cache.forEach(g => reportGuildData(g.id));
  }, 2000);
  setInterval(sendBotStatus, 30000);
  setInterval(pollActions, 2000);
});

client.on(Events.GuildCreate, guild => { sendBotStatus(); reportGuildData(guild.id); });
client.on(Events.GuildDelete, () => sendBotStatus());

async function pollActions() {
  try {
    const r = await apiFetch('${BASE_URL}/api/bot-actions');
    if (!r) return;
    const actions = await r.json();
    for (const action of actions) {
      if (action.type === 'post-panel') await postPanel(action.data.guildId, action.data.panel);
      if (action.type === 'ticket-action') await handleDashboardTicketAction(action.data);
    }
  } catch {}
}

async function handleDashboardTicketAction(data) {
  const { guildId, channelId, action, value } = data;
  let channel = client.channels.cache.get(channelId);
  if (!channel) { try { channel = await client.channels.fetch(channelId); } catch {} }
  const session = sessions.get(channelId);
  const config = session?.config || await getConfig(guildId);
  const t = getLang(config);
  if (!channel) return;

  if (action === 'close') {
    await channel.send({ embeds: [new EmbedBuilder().setDescription('Ticket closed by an admin.').setColor(0xef4444)] });
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 5000);
  }
  if (action === 'approve' && session) {
    const approvedMsg = config.approvedMsg || t.approved();
    await channel.send({ embeds: [new EmbedBuilder().setTitle(t.orderApproved).setDescription(approvedMsg).setColor(0x84CC16).setTimestamp()] });
    session.status = 'approved'; syncTicket(session);
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
  if (action === 'reject' && session) {
    await channel.send({ embeds: [new EmbedBuilder().setTitle(t.orderRejected).setDescription(t.rejected).setColor(0xef4444).setTimestamp()] });
    session.status = 'rejected'; syncTicket(session);
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 120_000);
  }
  if (action === 'clear-chat') { try { await channel.bulkDelete(100, true); } catch {} }
  if (action === 'send-message' && value?.trim()) { await channel.send({ content: value }); }
  if (action === 'set-typing') {
    const canType = !!value;
    const userId = session?.userId;
    if (userId) {
      try {
        await channel.permissionOverwrites.edit(userId, { SendMessages: canType, AttachFiles: canType });
        if (session) { session.canType = canType; syncTicket(session); }
      } catch (e) { console.error('[set-typing] Failed:', e.message); }
    }
  }
}

async function postPanel(guildId, panel) {
  if (!panel.channelId) return;
  const channel = client.channels.cache.get(panel.channelId) || await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel) return;
  const config = await getConfig(guildId);
  const t = getLang(config);
  const color = parseInt((panel.color || '#8B5CF6').replace('#', ''), 16);
  let desc = panel.description || 'Click the button below to open a purchase ticket.';
  if (panel.type === 'product' && panel.products?.length)
    desc += '\n\n**Available Products:**\n' + panel.products.map(p => `> **${p.name}** — ${p.price}`).join('\n');
  const embed = new EmbedBuilder().setTitle(panel.title).setDescription(desc).setColor(color).setFooter({ text: t.poweredBy }).setTimestamp();
  if (panel.bannerUrl) embed.setImage(panel.bannerUrl);
  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  const panels = await getPanels(guildId);
  const idx = panels.findIndex(p => p.title === panel.title);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_ticket_${guildId}_${idx}`).setLabel(t.openTicket).setStyle(ButtonStyle.Primary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

// ─── GLOBAL INTERACTION ROUTER ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('open_ticket_'))       return handleOpenTicket(interaction);
      if (id.startsWith('admin_approve_'))     return handleAdminApprove(interaction);
      if (id.startsWith('admin_reject_'))      return handleAdminReject(interaction);
      if (id.startsWith('close_ticket_'))      return handleCloseTicket(interaction);
      // These now go through the global handler — showModal is called immediately
      if (id.startsWith('open_qmodal_'))       return handleQuestionModalTrigger(interaction);
      if (id.startsWith('open_amount_modal_')) return handleAmountModalTrigger(interaction);
      if (id.startsWith('open_proof_modal_'))  return handleProofModalTrigger(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === 'select_currency')  return handleCurrencySelect(interaction);
      if (id === 'select_product')   return handleProductSelect(interaction);
      if (id === 'select_payment')   return handlePaymentSelect(interaction);
    }
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith('modal_question_')) return handleModalQuestion(interaction);
      if (id === 'modal_currency_amount')   return handleCurrencyAmountModal(interaction);
      if (id === 'modal_payment_proof')     return handlePaymentProofModal(interaction);
    }
  } catch(e) { console.error(e); }
});

// ─── MODAL TRIGGER HANDLERS (called directly from global router) ───────────────
// Key insight: showModal() must be the very first await — no DB calls, no edits before it.

async function handleQuestionModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_qmodal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  if (!session.pendingModal) return interaction.reply({ content: 'No question pending.', flags: 64 });
  // showModal FIRST — no awaits before this line
  await interaction.showModal(session.pendingModal);
  // Disable the trigger button after (non-blocking)
  interaction.message.edit({ components: [] }).catch(() => {});
}

async function handleAmountModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_amount_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  if (!session.pendingModal) return interaction.reply({ content: 'No amount modal pending.', flags: 64 });
  await interaction.showModal(session.pendingModal);
  interaction.message.edit({ components: [] }).catch(() => {});
}

async function handleProofModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_proof_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  if (!session.pendingModal) return interaction.reply({ content: 'No proof modal pending.', flags: 64 });
  // showModal FIRST
  await interaction.showModal(session.pendingModal);
  // Side effects after — non-blocking
  interaction.message.edit({ components: [] }).catch(() => {});
  session.phase = 'awaiting-proof-message';
  const t = getLang(session.config);
  const channel = interaction.channel;
  setCanType(channel, session.userId, true).catch(() => {});
  channel.send({ embeds: [new EmbedBuilder().setDescription(t.sendScreenshot).setColor(0xf59e0b)] }).catch(() => {});
}

// ─── TICKET OPEN ───────────────────────────────────────────────────────────────
async function handleOpenTicket(interaction) {
  const [,, guildId, idxStr] = interaction.customId.split('_');
  await interaction.deferReply({ flags: 64 });
  const panels = await getPanels(guildId);
  const panel  = panels[parseInt(idxStr)];
  if (!panel) return interaction.editReply({ content: 'This panel no longer exists.' });
  const config = await getConfig(guildId);
  const t = getLang(config);
  const guild  = interaction.guild;
  const member = interaction.member;
  const existing = [...sessions.values()].find(s => s.userId === member.id && s.guildId === guildId);
  if (existing) return interaction.editReply({ content: t.alreadyOpen(existing.channelId) });

  const permissionOverwrites = [
    { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
    { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];
  if (config.adminRole) permissionOverwrites.push({ id: config.adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const ticketChannel = await guild.channels.create({
    name: `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategory || null,
    permissionOverwrites,
    topic: `Ticket for ${member.user.tag} | ${panel.title}`,
  });

  const session = {
    channelId: ticketChannel.id, guildId, panel, config,
    userId: member.id, username: member.user.tag,
    phase: 'questions', questionIndex: 0, answers: [],
    currency: null, currencyAmount: null, total: null,
    paymentMethod: null, selectedProduct: null,
    pendingModal: null,
    status: 'open', canType: false, reported: false,
    openedAt: Date.now(), pastTickets: [],
  };
  sessions.set(ticketChannel.id, session);
  syncTicket(session);

  const color = parseInt((panel.color || '#8B5CF6').replace('#', ''), 16);
  const welcomeEmbed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(config.welcomeMsg || t.welcome(`<@${member.id}>`))
    .setColor(color)
    .addFields({ name: t.openedBy, value: `<@${member.id}>`, inline: true })
    .setTimestamp();
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`close_ticket_${ticketChannel.id}`).setLabel(t.closeTicket).setStyle(ButtonStyle.Danger)
  );
  await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });
  await startNextStep(ticketChannel, session);
  await interaction.editReply({ content: t.ticketReady(ticketChannel.id) });
}

// ─── FLOW ──────────────────────────────────────────────────────────────────────
async function startNextStep(channel, session) {
  if (session.phase !== 'questions') return;
  if (session.questionIndex < session.panel.questions.length) return askQuestion(channel, session);
  if (session.panel.type === 'currency') { session.phase = 'currency-select'; return askCurrencySelect(channel, session); }
  if (session.panel.type === 'product')  { session.phase = 'product-select';  return askProductSelect(channel, session); }
  session.phase = 'payment-select';
  return askPaymentSelect(channel, session);
}

async function askQuestion(channel, session) {
  const q = session.panel.questions[session.questionIndex];
  const t = getLang(session.config);

  if (q.type === 'image') {
    await setCanType(channel, session.userId, true);
    await channel.send({ embeds: [new EmbedBuilder()
      .setDescription(`**Question ${session.questionIndex + 1} of ${session.panel.questions.length}**\n\n${q.text}`)
      .setColor(0x8B5CF6).setFooter({ text: t.sendImageAnswer })] });
    session.phase = 'awaiting-image';
    return;
  }

  if (q.type === 'text' || q.type === 'number') {
    const modal = new ModalBuilder()
      .setCustomId(`modal_question_${channel.id}`)
      .setTitle(`Question ${session.questionIndex + 1}`);
    const input = new TextInputBuilder()
      .setCustomId('answer')
      .setLabel(q.text.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(q.required ?? true)
      .setPlaceholder(q.type === 'number' ? t.numbersOnly : t.typeAnswer);
    if (q.maxLength) input.setMaxLength(q.maxLength);
    if (q.minLength) input.setMinLength(q.minLength);
    modal.addComponents(new ActionRowBuilder().addComponents(input));

    // Store modal in session — the global button handler shows it instantly
    session.pendingModal = modal;

    await channel.send({
      embeds: [new EmbedBuilder()
        .setDescription(`**Question ${session.questionIndex + 1} of ${session.panel.questions.length}**\n\n${q.text}`)
        .setColor(0x8B5CF6)
        .setFooter({ text: q.required ? t.questionRequired : t.questionOptional })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`open_qmodal_${channel.id}`).setLabel(t.answerQuestion).setStyle(ButtonStyle.Primary)
      )]
    });
    return;
  }

  if (q.type === 'user') {
    await setCanType(channel, session.userId, true);
    await channel.send({ embeds: [new EmbedBuilder()
      .setDescription(`**Question ${session.questionIndex + 1} of ${session.panel.questions.length}**\n\n${q.text}`)
      .setColor(0x8B5CF6).setFooter({ text: t.mentionUserAnswer })] });
    session.phase = 'awaiting-user-mention';
    return;
  }
}

async function handleModalQuestion(interaction) {
  const channelId = interaction.customId.replace('modal_question_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  const q = session.panel.questions[session.questionIndex];
  let answer = interaction.fields.getTextInputValue('answer').trim();
  if (q.type === 'number' && isNaN(answer.replace(/,/g, ''))) return interaction.reply({ content: t.pleaseValidNum, flags: 64 });
  await interaction.deferUpdate().catch(() => {});
  session.answers.push({ question: q.text, answer: answer || '*(skipped)*', type: q.type });
  session.questionIndex++;
  session.pendingModal = null;
  syncTicket(session);
  await interaction.channel.send({ embeds: [new EmbedBuilder()
    .setDescription(`**Q${session.questionIndex}:** ${q.text}\n**A:** ${answer || '*(skipped)*'}`)
    .setColor(0x84CC16)] });
  session.phase = 'questions';
  await startNextStep(interaction.channel, session);
}

// ─── MESSAGE LISTENER ──────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const session = sessions.get(message.channel.id);
  if (!session || message.author.id !== session.userId) return;
  const t = getLang(session.config);

  if (session.phase === 'awaiting-image') {
    if (!message.attachments.size) { await message.reply({ content: t.pleaseAttachImage }); return; }
    const q = session.panel.questions[session.questionIndex];
    session.answers.push({ question: q.text, answer: message.attachments.first().url, type: 'image' });
    session.questionIndex++;
    await setCanType(message.channel, session.userId, false);
    await message.react('✅').catch(() => {});
    session.phase = 'questions';
    syncTicket(session);
    await startNextStep(message.channel, session);
    return;
  }

  if (session.phase === 'awaiting-user-mention') {
    const mentioned = message.mentions.users.first();
    if (!mentioned) { await message.reply({ content: t.pleaseAttachUser }); return; }
    const q = session.panel.questions[session.questionIndex];
    session.answers.push({ question: q.text, answer: `<@${mentioned.id}> (${mentioned.tag})`, type: 'user' });
    session.questionIndex++;
    await setCanType(message.channel, session.userId, false);
    await message.react('✅').catch(() => {});
    session.phase = 'questions';
    syncTicket(session);
    await startNextStep(message.channel, session);
    return;
  }

  if (session.phase === 'awaiting-proof-message') {
    session.paymentProof = { text: message.content, imageUrl: message.attachments.first()?.url || null };
    session.phase = 'done';
    session.status = 'pending';
    await setCanType(message.channel, session.userId, false);
    await message.react('✅').catch(() => {});
    syncTicket(session);
    await finishTicket(message.channel, session);
    return;
  }
});

// ─── CURRENCY ──────────────────────────────────────────────────────────────────
async function askCurrencySelect(channel, session) {
  const t = getLang(session.config);
  const select = new StringSelectMenuBuilder().setCustomId('select_currency').setPlaceholder(t.selectCurrencyPlaceholder)
    .addOptions(CURRENCIES.map(c => ({ label: c.label, value: c.value })));
  await channel.send({
    embeds: [new EmbedBuilder().setDescription(`**${t.selectCurrency}**\n${t.selectCurrencyDesc}`).setColor(0x8B5CF6)],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function handleCurrencySelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  session.currency = interaction.values[0];
  session.phase = 'currency-amount';
  await interaction.update({
    embeds: [new EmbedBuilder().setDescription(t.currencySelected(session.currency)).setColor(0x84CC16)],
    components: []
  });

  const modal = new ModalBuilder().setCustomId('modal_currency_amount').setTitle(t.enterAmount(session.panel.title.slice(0, 20)));
  const input = new TextInputBuilder().setCustomId('amount').setLabel(t.amountLabel)
    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(t.enterAmountPlaceholder);
  modal.addComponents(new ActionRowBuilder().addComponents(input));

  // Store modal in session
  session.pendingModal = modal;

  await interaction.channel.send({
    embeds: [new EmbedBuilder().setDescription(`**${t.enterAmount(session.panel.title)}**`).setColor(0x8B5CF6)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_amount_modal_${interaction.channel.id}`).setLabel(t.enterAmountBtn).setStyle(ButtonStyle.Primary)
    )]
  });
}

async function handleCurrencyAmountModal(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  const raw = interaction.fields.getTextInputValue('amount').replace(/,/g, '').trim();
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) return interaction.reply({ content: t.pleaseValidNumber, flags: 64 });
  const { panel } = session;
  const currencyInfo = CURRENCIES.find(c => c.value === session.currency) || CURRENCIES[0];
  const usdTotal = (amount / panel.baseAmount) * panel.basePrice * (1 + (panel.margin ?? 15) / 100);
  const localTotal = usdTotal / currencyInfo.rate;
  session.currencyAmount = amount;
  session.total = parseFloat(localTotal.toFixed(2));
  session.totalDisplay = `${currencyInfo.symbol}${session.total.toLocaleString()} ${session.currency}`;
  session.selectedProduct = `${amount.toLocaleString()} ${panel.title}`;
  session.pendingModal = null;
  await interaction.deferUpdate().catch(() => {});
  await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(t.orderSummary).setColor(0x84CC16)
    .addFields(
      { name: t.item, value: panel.title, inline: true },
      { name: t.amount, value: `${amount.toLocaleString()}`, inline: true },
      { name: t.totalToPay, value: `**${session.totalDisplay}**`, inline: false }
    ).setFooter({ text: t.priceFee })] });
  syncTicket(session);
  session.phase = 'payment-select';
  await askPaymentSelect(interaction.channel, session);
}

// ─── PRODUCT ───────────────────────────────────────────────────────────────────
async function askProductSelect(channel, session) {
  const t = getLang(session.config);
  const { products } = session.panel;
  if (!products?.length) { session.phase = 'payment-select'; return askPaymentSelect(channel, session); }
  const select = new StringSelectMenuBuilder().setCustomId('select_product').setPlaceholder(t.selectProductPlaceholder)
    .addOptions(products.map(p => ({ label: p.name, description: String(p.price), value: p.name })));
  await channel.send({
    embeds: [new EmbedBuilder().setDescription(`**${t.selectProduct}**`).setColor(0x8B5CF6)],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function handleProductSelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  const product = session.panel.products.find(p => p.name === interaction.values[0]);
  session.selectedProduct = product.name;
  session.totalDisplay = product.price;
  await interaction.update({
    embeds: [new EmbedBuilder().setDescription(t.selectedProduct(product.name, product.price)).setColor(0x84CC16)],
    components: []
  });
  syncTicket(session);
  session.phase = 'payment-select';
  await askPaymentSelect(interaction.channel, session);
}

// ─── PAYMENT ───────────────────────────────────────────────────────────────────
async function askPaymentSelect(channel, session) {
  const t = getLang(session.config);
  const methods = session.config.paymentMethods || ['paypal', 'crypto'];
  if (!methods.length) {
    await channel.send({ embeds: [new EmbedBuilder().setDescription(t.noPaymentMethods).setColor(0xef4444)] });
    return;
  }
  const select = new StringSelectMenuBuilder().setCustomId('select_payment').setPlaceholder(t.selectPaymentPlaceholder)
    .addOptions(methods.map(m => ({ label: (PAYMENT_LABELS[m] || { label: m }).label, value: m })));
  await channel.send({
    embeds: [new EmbedBuilder().setDescription(`**${t.selectPayment}**`).setColor(0x8B5CF6)],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function handlePaymentSelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  const method = interaction.values[0];
  session.paymentMethod = method;
  const info = PAYMENT_LABELS[method] || { label: method };
  const account = (session.config.paymentAccounts || {})[method];
  const totalText = session.totalDisplay || 'as agreed';

  // Build the proof modal and store it in session
  const modal = new ModalBuilder().setCustomId('modal_payment_proof').setTitle(t.proofModalTitle);
  const refInput = new TextInputBuilder().setCustomId('reference').setLabel(t.refLabel)
    .setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(t.refPlaceholder);
  const noteInput = new TextInputBuilder().setCustomId('note').setLabel(t.noteLabel)
    .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300);
  modal.addComponents(new ActionRowBuilder().addComponents(refInput), new ActionRowBuilder().addComponents(noteInput));
  session.pendingModal = modal;

  await interaction.update({
    embeds: [new EmbedBuilder().setDescription(t.paymentMethodSelected(info.label)).setColor(0x84CC16)],
    components: []
  });

  const embed = new EmbedBuilder().setTitle(t.payWith(info.label)).setDescription(t.payDesc).setColor(0xf59e0b)
    .addFields(
      { name: t.amount, value: `**${totalText}**`, inline: true },
      ...(account ? [{ name: t.sendTo, value: `\`${account}\``, inline: true }] : [])
    );

  await interaction.channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_proof_modal_${interaction.channel.id}`).setLabel(t.submitProof).setStyle(ButtonStyle.Success)
    )]
  });
}

async function handlePaymentProofModal(interaction) {
  const session = sessions.get(interaction.channel.id);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: 64 });
  session.paymentReference = interaction.fields.getTextInputValue('reference').trim();
  session.paymentNote = interaction.fields.getTextInputValue('note').trim();
  session.pendingModal = null;
  await interaction.deferUpdate().catch(() => {});
}

// ─── FINISH ────────────────────────────────────────────────────────────────────
async function finishTicket(channel, session) {
  const t = getLang(session.config);
  await channel.send({ embeds: [new EmbedBuilder().setTitle(t.purchaseSubmitted).setDescription(t.purchaseSubmittedDesc).setColor(0x84CC16)
    .addFields(
      { name: t.product, value: session.selectedProduct || session.panel.title, inline: true },
      { name: t.paymentMethod, value: PAYMENT_LABELS[session.paymentMethod]?.label || session.paymentMethod, inline: true },
      ...(session.totalDisplay ? [{ name: t.total, value: session.totalDisplay, inline: true }] : [])
    ).setTimestamp()] });
  await notifyAdmin(session);
}

async function notifyAdmin(session) {
  if (!session.config.logChannel) return;
  const logChannel = client.channels.cache.get(session.config.logChannel) || await client.channels.fetch(session.config.logChannel).catch(() => null);
  if (!logChannel) return;
  const t = getLang(session.config);
  const embed = new EmbedBuilder().setTitle(t.adminPending).setColor(0xf59e0b)
    .addFields(
      { name: t.user,    value: `<@${session.userId}> (${session.username})`, inline: true },
      { name: t.panel,   value: session.panel.title, inline: true },
      { name: t.ticket,  value: `<#${session.channelId}>`, inline: true },
      { name: t.payment, value: PAYMENT_LABELS[session.paymentMethod]?.label || session.paymentMethod || 'N/A', inline: true },
      ...(session.totalDisplay ? [{ name: t.total, value: session.totalDisplay, inline: true }] : []),
      ...(session.paymentReference ? [{ name: t.reference, value: session.paymentReference, inline: true }] : []),
      ...session.answers.map(a => ({ name: a.question.slice(0, 256), value: String(a.answer).slice(0, 1024), inline: true })),
      ...(session.paymentNote ? [{ name: t.note, value: session.paymentNote }] : []),
      ...(session.paymentProof?.imageUrl ? [{ name: t.screenshot, value: session.paymentProof.imageUrl }] : [])
    ).setTimestamp();
  if (session.paymentProof?.imageUrl) embed.setImage(session.paymentProof.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`admin_approve_${session.channelId}`).setLabel(t.approveBtn).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`admin_reject_${session.channelId}`).setLabel(t.rejectBtn).setStyle(ButtonStyle.Danger)
  );
  await logChannel.send({ embeds: [embed], components: [row] });
}

// ─── ADMIN BUTTONS ─────────────────────────────────────────────────────────────
async function handleAdminApprove(interaction) {
  const channelId = interaction.customId.replace('admin_approve_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(t.approvedBy(`<@${interaction.user.id}>`)).setColor(0x84CC16)],
    components: []
  });
  if (ticketChannel) {
    const approvedMsg = session?.config?.approvedMsg || t.approved();
    await ticketChannel.send({ embeds: [new EmbedBuilder().setTitle(t.orderApproved).setDescription(approvedMsg).setColor(0x84CC16).setTimestamp()] });
    if (session) { session.status = 'approved'; syncTicket(session); }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
}

async function handleAdminReject(interaction) {
  const channelId = interaction.customId.replace('admin_reject_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(t.rejectedBy(`<@${interaction.user.id}>`)).setColor(0xef4444)],
    components: []
  });
  if (ticketChannel) {
    await ticketChannel.send({ embeds: [new EmbedBuilder().setTitle(t.orderRejected).setDescription(t.rejected).setColor(0xef4444).setTimestamp()] });
    if (session) { session.status = 'rejected'; syncTicket(session); }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 120_000);
  }
}

async function handleCloseTicket(interaction) {
  const channelId = interaction.customId.replace('close_ticket_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
    return interaction.reply({ content: t.staffOnly, flags: 64 });
  await interaction.reply({ content: t.closingIn5 });
  if (session) { session.status = 'closed'; syncTicket(session); }
  setTimeout(() => { interaction.channel.delete().catch(() => {}); sessions.delete(channelId); }, 5000);
}

async function setCanType(channel, userId, canType) {
  try { await channel.permissionOverwrites.edit(userId, { SendMessages: canType, AttachFiles: canType }); }
  catch (e) { console.error('[setCanType]', e.message); }
}

client.login(process.env.DISCORD_TOKEN);