require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, Events, MessageFlags
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

let globalBans = [];
async function refreshGlobalBans() {
  try {
    const r = await apiFetch(`${BASE_URL}/internal/global-bans`);
    if (r) globalBans = await r.json();
  } catch {}
}
function getActiveGlobalBan(userId) {
  const ban = globalBans.find(b => b.userId === userId);
  if (!ban) return null;
  if (ban.expiresAt && Date.now() > ban.expiresAt) return null; // expired temp ban
  return ban;
}

let globalSuspensions = [];
async function refreshGlobalSuspensions() {
  try {
    const r = await apiFetch(`${BASE_URL}/internal/suspensions`);
    if (r) globalSuspensions = await r.json();
  } catch {}
}
function getActiveSuspension(userId) {
  const s = globalSuspensions.find(x => x.userId === userId);
  if (!s) return null;
  if (s.expiresAt && Date.now() > s.expiresAt) return null;
  return s;
}

const DEFAULT_CURRENCIES = [
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

// Servers can customize their own currency list from the dashboard (Settings → Currencies).
// Falls back to the defaults above if the guild hasn't configured any.
function getCurrencies(config) {
  const custom = config?.currencies;
  return (Array.isArray(custom) && custom.length) ? custom : DEFAULT_CURRENCIES;
}

// Kept in sync with ALL_METHODS in public/server.html — every method an admin
// can enable from the dashboard needs a matching label here, or buyers would
// just see the raw internal key (e.g. "crypto_btc") instead of "Bitcoin (BTC)".
const PAYMENT_LABELS = {
  paypal:       { label: 'PayPal' },
  zelle:        { label: 'Zelle' },
  cashapp:      { label: 'Cash App' },
  venmo:        { label: 'Venmo' },
  crypto_btc:   { label: 'Bitcoin (BTC)' },
  crypto_eth:   { label: 'Ethereum (ETH)' },
  crypto_usdt:  { label: 'USDT (TRC20/ERC20)' },
  crypto_ltc:   { label: 'Litecoin (LTC)' },
  binance_pay:  { label: 'Binance Pay' },
  nequi:        { label: 'Nequi' },
  bancolombia:  { label: 'Bancolombia' },
  daviplata:    { label: 'Daviplata' },
  mercadopago:  { label: 'Mercado Pago' },
  pix:          { label: 'PIX' },
  zinli:        { label: 'Zinli' },
  bank:         { label: 'Bank Transfer' },
  wise:         { label: 'Wise' },
  revolut:      { label: 'Revolut' },
  skrill:       { label: 'Skrill' },
  applepay:     { label: 'Apple Pay' },
  googlepay:    { label: 'Google Pay' },
  amazon_gc:    { label: 'Amazon Gift Card' },
  steam_gc:     { label: 'Steam Gift Card' },
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
    blacklisted: 'You are not able to open tickets in this server. If you think this is a mistake, contact staff directly.',
globalBanned: (reason, until) =>
  `🚫 You are banned from using this bot${until ? ` until **${until}**` : ' **permanently**'}.\n**Reason:** ${reason}`,
suspended: (reason, until) =>
  `⏳ You are temporarily suspended from using this bot until **${until}**.\n**Reason:** ${reason}`,
    couponPrompt: 'Do you have a coupon code?',
    couponEnterBtn: 'Enter coupon',
    couponSkipBtn: 'Continue without coupon',
    couponModalTitle: 'Coupon Code',
    couponLabel: 'Code',
    couponPlaceholder: 'e.g. SAVE10',
    couponInvalid: 'That coupon is invalid, expired, or fully used. Try another code or continue without one.',
    couponApplied: (code, total) => `✅ Coupon **${code}** applied. New total: **${total}**`,
    couponNoted: (code) => `Coupon **${code}** noted for this order. An admin will verify and apply the discount manually for this product/service.`,
    donateWelcome: (mention) => `Welcome ${mention}! You're about to make a donation to support this server. Every contribution helps!`,
    donateAmountBtn: 'Enter Donation Amount',
    donateAmountLabel: 'Donation Amount (USD)',
    donateAmountPlaceholder: 'e.g. 10, 25, 50',
    donateAmountMin: (min) => `Minimum donation is **$${min}**.`,
    donateAmountInvalid: 'Please enter a valid amount greater than 0.',
    donateAmountTitle: 'Donation Amount',
    donateSelectMethod: 'Choose your payment method:',
    donateSelectMethodPlaceholder: 'Select a payment method...',
    donatePayWith: (method, amount) => `Donate **$${amount}** with ${method}`,
    donatePayDesc: 'Send the exact amount to the account below, then submit your proof of payment.',
    donateSendTo: 'Send to',
    donateAmount: 'Amount',
    donateSubmitProof: 'Submit Payment Proof',
    donateProofModalTitle: 'Donation Proof',
    donateProofLabel: 'Transaction ID / Reference (optional)',
    donateProofPlaceholder: 'e.g. TXN123456789',
    donateNoteLabel: 'Note (optional)',
    donateSendScreenshot: 'Now send your **payment screenshot** as an image in this channel, or type a message as confirmation.',
    donateSubmitted: 'Donation Submitted',
    donateSubmittedDesc: 'Your donation has been submitted and is pending verification. A staff member will review it shortly. Thank you for your support!',
    donateStaffPending: '💰 Donation — Pending Verification',
    donateApprove: 'Approve Donation',
    donateReject: 'Reject Donation',
    donateApproved: () => 'Your donation has been approved and recorded. Thank you for your generous support!',
    donateRejected: 'Your donation could not be verified. Please contact staff if you believe this is a mistake.\n\nThis ticket closes in 2 minutes.',
    donateApprovedTitle: 'Donation Approved',
    donateRejectedTitle: 'Donation Rejected',
    donateApprovedBy: (mention) => `Approved by ${mention}`,
    donateRejectedBy: (mention) => `Rejected by ${mention}`,
    donateAlreadyOpen: (channelId) => `You already have an open donation ticket → <#${channelId}>`,
    donateTicketReady: (channelId) => `Your donation ticket is ready → <#${channelId}>`,
    donatePanelTitle: 'Support Us',
    donatePanelCTA: 'Click the button below to make a donation!',
    donateProgress: 'Goal Progress',
    donateRecent: 'Recent Supporters',
    donateMethods: 'Accepted Methods',
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
    blacklisted: 'No puedes abrir tickets en este servidor. Si crees que esto es un error, contacta al staff directamente.',
globalBanned: (reason, until) =>
  `🚫 Estás baneado de este bot${until ? ` hasta **${until}**` : ' **permanentemente**'}.\n**Motivo:** ${reason}`,
suspended: (reason, until) =>
  `⏳ Estás temporalmente suspendido de este bot hasta **${until}**.\n**Motivo:** ${reason}`,
    couponPrompt: '¿Tienes un código de cupón?',
    couponEnterBtn: 'Ingresar cupón',
    couponSkipBtn: 'Continuar sin cupón',
    couponModalTitle: 'Código de Cupón',
    couponLabel: 'Código',
    couponPlaceholder: 'ej. SAVE10',
    couponInvalid: 'Ese cupón es inválido, expiró, o ya alcanzó su límite de usos. Intenta con otro código o continúa sin cupón.',
    couponApplied: (code, total) => `✅ Cupón **${code}** aplicado. Nuevo total: **${total}**`,
    couponNoted: (code) => `Cupón **${code}** anotado para este pedido. Un administrador verificará y aplicará el descuento manualmente para este producto/servicio.`,
    donateWelcome: (mention) => `¡Bienvenido ${mention}! Estás a punto de hacer una donación para apoyar este servidor. ¡Cada contribución cuenta!`,
    donateAmountBtn: 'Ingresar Cantidad',
    donateAmountLabel: 'Cantidad de Donación (USD)',
    donateAmountPlaceholder: 'ej. 10, 25, 50',
    donateAmountMin: (min) => `La donación mínima es **$${min}**.`,
    donateAmountInvalid: 'Por favor ingresa una cantidad válida mayor a 0.',
    donateAmountTitle: 'Cantidad de Donación',
    donateSelectMethod: 'Elige tu método de pago:',
    donateSelectMethodPlaceholder: 'Selecciona un método de pago...',
    donatePayWith: (method, amount) => `Donar **$${amount}** con ${method}`,
    donatePayDesc: 'Envía la cantidad exacta a la cuenta de abajo, luego envía tu comprobante de pago.',
    donateSendTo: 'Enviar a',
    donateAmount: 'Cantidad',
    donateSubmitProof: 'Enviar Comprobante de Pago',
    donateProofModalTitle: 'Comprobante de Donación',
    donateProofLabel: 'ID de Transacción / Referencia (opcional)',
    donateProofPlaceholder: 'ej. TXN123456789',
    donateNoteLabel: 'Nota (opcional)',
    donateSendScreenshot: 'Ahora envía tu **captura de pantalla del pago** como imagen en este canal, o escribe un mensaje como confirmación.',
    donateSubmitted: 'Donación Enviada',
    donateSubmittedDesc: 'Tu donación fue enviada y está pendiente de verificación. Un miembro del staff la revisará pronto. ¡Gracias por tu apoyo!',
    donateStaffPending: '💰 Donación — Verificación Pendiente',
    donateApprove: 'Aprobar Donación',
    donateReject: 'Rechazar Donación',
    donateApproved: () => '¡Tu donación fue aprobada y registrada. ¡Gracias por tu generoso apoyo!',
    donateRejected: 'No se pudo verificar tu donación. Contacta al staff si crees que esto es un error.\n\nEste ticket se cierra en 2 minutos.',
    donateApprovedTitle: 'Donación Aprobada',
    donateRejectedTitle: 'Donación Rechazada',
    donateApprovedBy: (mention) => `Aprobado por ${mention}`,
    donateRejectedBy: (mention) => `Rechazado por ${mention}`,
    donateAlreadyOpen: (channelId) => `Ya tienes un ticket de donación abierto → <#${channelId}>`,
    donateTicketReady: (channelId) => `Tu ticket de donación está listo → <#${channelId}>`,
    donatePanelTitle: 'Apóyanos',
    donatePanelCTA: '¡Haz clic en el botón de abajo para hacer una donación!',
    donateProgress: 'Progreso de la Meta',
    donateRecent: 'Donadores Recientes',
    donateMethods: 'Métodos de Pago Aceptados',
  }
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function getLang(config) { return T[config?.language] || T.en; }

function getColors(config) {
  const ec = config?.embedColors || {};
  const hex = (v, fallback) => { const h = v || fallback; return parseInt(h.replace('#',''), 16); };
  return {
    primary: hex(ec.primary, '#8B5CF6'),
    success: hex(ec.success, '#84CC16'),
    error: hex(ec.error, '#EF4444'),
    warning: hex(ec.warning, '#F59E0B'),
  };
}

const EMOJI_DEFAULTS = {
  success: '✅', error: '❌',
  ticketOpened: '🎫', ticketClosed: '🔒',
};

function getEmojis(config) {
  const saved = config?.emojis || {};
  const out = {};
  for (const [k, def] of Object.entries(EMOJI_DEFAULTS)) out[k] = saved[k] || def;
  return out;
}

function progressBar(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.round(pct / 10);
  return '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '` ' + pct + '%';
}

function stepIndicator(current, total) {
  return `**Step ${current} of ${total}**`;
}

async function editTicketMessage(channel, session, embeds, components) {
  if (!session?.ticketMessageId) return null;
  const msg = await channel.messages.fetch(session.ticketMessageId).catch(() => null);
  if (!msg) return null;
  return msg.edit({ embeds, components: components || [] }).catch(() => null);
}

function resolveChannelName(config, panel, username, userId) {
  const fmt = config?.ticketNaming || 'ticket-{username}';
  return fmt.replace(/\{username\}/g, username).replace(/\{userId\}/g, userId).replace(/\{panel\}/g, panel).toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 100);
}

async function apiFetch(url, opts, retries = 3) {
  const secret = process.env.PRICEY_INTERNAL_SECRET;
  const headers = { ...(opts?.headers || {}) };
  if (secret) headers['x-internal-secret'] = secret;
  const merged = { ...opts, headers };
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, merged);
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
async function savePanels(guildId, panels) {
  try { await apiFetch(`${BASE_URL}/internal/panels/${guildId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(panels) }); }
  catch (e) { console.error('[savePanels]', e.message); }
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

// ─── Notify Pricey Help (bot 2) whenever this bot joins a new server ───────
// Pricey Help exposes a private endpoint protected by a shared secret; it
// posts a "new server" notice with real, live data (guild info + current
// total guild count) to whatever channel was set with /setup-guild-log.
async function notifyPriceyHelp(guild) {
  const url = process.env.PRICEY_HELP_URL;
  const secret = process.env.PRICEY_INTERNAL_SECRET;
  if (!url || !secret) return; // not configured, fails silently

  let ownerTag = null;
  try {
    const owner = await guild.fetchOwner();
    ownerTag = owner.user.tag;
  } catch {
    // if the owner can't be fetched, just continue without it
  }

  try {
    await apiFetch(`${url}/internal/guild-joined`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        guildId: guild.id,
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 256 }) || null,
        memberCount: guild.memberCount ?? null,
        ownerTag,
        totalGuilds: client.guilds.cache.size, // real count, not made up
        joinedAt: Date.now(),
      }),
    }, 2);
  } catch (e) {
    console.error('[notifyPriceyHelp]', e.message);
  }
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
        type: session.type || 'sale',
        channelId: session.channelId,
        guildId: session.guildId,
        userId: session.userId,
        username: session.username,
        panel: session.panel,
        status: session.status || 'open',
        selectedProduct: session.selectedProduct || null,
        currencyAmount: session.currencyAmount || null,
        totalDisplay: session.totalDisplay || null,
        totalUSD: session.totalUSD ?? null,
        appliedCoupon: session.appliedCoupon || null,
        paymentMethod: session.paymentMethod || null,
        paymentReference: session.paymentReference || null,
        paymentNote: session.paymentNote || null,
        paymentProof: session.paymentProof || null,
        donationAmount: session.donationAmount || null,
        donationMethod: session.donationMethod || null,
        ticketMessageId: session.ticketMessageId || null,
        answers: session.answers || [],
        canType: session.canType || false,
        reported: session.reported || false,
        priority: session.priority || 'normal',
        staffNotes: session.staffNotes || [],
        transcript: session.transcript || null,
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
  refreshGlobalBans();
  refreshGlobalSuspensions();
  setInterval(sendBotStatus, 30000);
  setInterval(pollActions, 2000);
  setInterval(refreshGlobalBans, 15000);
  setInterval(refreshGlobalSuspensions, 15000);
});

client.on(Events.GuildCreate, guild => {
  sendBotStatus();
  reportGuildData(guild.id);
  notifyPriceyHelp(guild);
});
client.on(Events.GuildDelete, () => sendBotStatus());

async function pollActions() {
  try {
    const r = await apiFetch(`${BASE_URL}/api/bot-actions`);
    if (!r) return;
    const actions = await r.json();
    for (const action of actions) {
      if (action.type === 'post-panel') await postPanel(action.data.guildId, action.data.panel);
      if (action.type === 'post-donation-panel') await postDonationPanel(action.data.guildId, action.data.donation);
      if (action.type === 'ticket-action') await handleDashboardTicketAction(action.data);
    }
  } catch {}
}

async function getSessionFromDisk(guildId, channelId) {
  try {
    const r = await apiFetch(`${BASE_URL}/api/tickets/${guildId}`);
    if (!r) return null;
    const tickets = await r.json();
    const t = tickets.find(x => x.channelId === channelId);
    if (!t) return null;
    const config = await getConfig(guildId);
    return {
      type: t.type || 'sale',
      channelId: t.channelId, guildId, config,
      panel: t.panel || {}, userId: t.userId, username: t.username,
      status: t.status || 'open', canType: t.canType || false,
      reported: t.reported || false, priority: t.priority || 'normal',
      staffNotes: t.staffNotes || [], transcript: t.transcript || null,
      answers: t.answers || [], selectedProduct: t.selectedProduct || null,
      totalDisplay: t.totalDisplay || null, totalUSD: t.totalUSD ?? null,
      currencyAmount: t.currencyAmount || null, appliedCoupon: t.appliedCoupon || null,
      paymentMethod: t.paymentMethod || null, paymentReference: t.paymentReference || null,
      paymentNote: t.paymentNote || null, paymentProof: t.paymentProof || null,
      donationAmount: t.donationAmount || null, donationMethod: t.donationMethod || null,
      ticketMessageId: t.ticketMessageId || null,
      donation: config.donation || {},
      openedAt: t.openedAt || Date.now(), pastTickets: t.pastTickets || [],
      pendingModal: null,
    };
  } catch { return null; }
}

async function handleDashboardTicketAction(data) {
  const { guildId, channelId, action, value } = data;
  let channel = client.channels.cache.get(channelId);
  if (!channel) { try { channel = await client.channels.fetch(channelId); } catch {} }
  let session = sessions.get(channelId);
  if (!session && channel) session = await getSessionFromDisk(guildId, channelId);
  const config = session?.config || await getConfig(guildId);
  const t = getLang(config);
  const colors = getColors(config);
  const emojis = getEmojis(config);
  if (!channel) return;

  if (action === 'close') {
    await generateAndSendTranscript(channel, session, 'Closed by admin');
    if (session) { session.status = 'closed'; syncTicket(session); }
    const closedMsg = config.closedMsg || 'Ticket closed by an admin.';
    await channel.send({ embeds: [new EmbedBuilder().setDescription(closedMsg).setColor(colors.error)] });
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 5000);
  }
  if (action === 'approve') {
    const approvedMsg = config.approvedMsg || t.approved();
    await generateAndSendTranscript(channel, session, 'Approved');
    await channel.send({ embeds: [new EmbedBuilder().setTitle(t.orderApproved).setDescription(approvedMsg).setColor(colors.success).setTimestamp()] });
    if (session) { session.status = 'approved'; syncTicket(session); }
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
  if (action === 'reject') {
    const rejectedMsg = config.rejectedMsg || t.rejected;
    await generateAndSendTranscript(channel, session, 'Rejected');
    await channel.send({ embeds: [new EmbedBuilder().setTitle(t.orderRejected).setDescription(rejectedMsg).setColor(colors.error).setTimestamp()] });
    if (session) { session.status = 'rejected'; syncTicket(session); }
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 120_000);
  }
  if (action === 'refund') {
    await generateAndSendTranscript(channel, session, 'Refunded');
    if (session) { session.status = 'refunded'; syncTicket(session); }
    await channel.send({ embeds: [new EmbedBuilder().setDescription('This order was marked as **refunded** by an admin.').setColor(colors.warning)] }).catch(() => {});
    setTimeout(() => { channel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
  if (action === 'clear-chat') { try { await channel.bulkDelete(100, true); } catch {} }
  if (action === 'send-message' && value?.trim()) { await channel.send({ content: value }); }
  if (action === 'add-note' && session && value?.trim()) {
    session.staffNotes = session.staffNotes || [];
    session.staffNotes.push({ text: value.trim(), author: 'Dashboard', at: Date.now() });
    syncTicket(session);
  }
  if (action === 'set-priority' && session) { session.priority = value; syncTicket(session); }
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
  if (action === 'set-reported' && session) { session.reported = !!value; syncTicket(session); }
}

async function postPanel(guildId, panel) {
  if (!panel.channelId) return;
  const channel = client.channels.cache.get(panel.channelId) || await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel) return;
  const config = await getConfig(guildId);
  const t = getLang(config);
  const colors = getColors(config);
  const emojis = getEmojis(config);
  const color = panel.color ? parseInt(panel.color.replace('#', ''), 16) : colors.primary;
  let desc = panel.description || 'Click the button below to open a purchase ticket.';
  if (panel.type === 'product' && panel.products?.length)
    desc += '\n\n**Available Products:**\n' + panel.products.map(p => `> **${p.name}** — ${p.price}`).join('\n');
  const footerText = config.footerText || t.poweredBy;
  const embed = new EmbedBuilder().setTitle(panel.title).setDescription(desc).setColor(color).setFooter({ text: footerText }).setTimestamp();
  if (panel.bannerUrl) embed.setImage(panel.bannerUrl);
  const thumb = panel.thumbnailUrl || config.thumbnailUrl;
  if (thumb) embed.setThumbnail(thumb);
  const panelId = panel.id || 'legacy';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_ticket_${guildId}_${panelId}`).setLabel(t.openTicket).setStyle(ButtonStyle.Primary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function postDonationPanel(guildId, donation) {
  if (!donation.channelId) return;
  const channel = client.channels.cache.get(donation.channelId) || await client.channels.fetch(donation.channelId).catch(() => null);
  if (!channel) return;
  const config = await getConfig(guildId);
  const donationData = await fetchDonationData(guildId);
  const embed = buildDonationEmbed(config, donation, donationData);
  const donateBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`donate_start_${guildId}`).setLabel('Donate').setStyle(ButtonStyle.Success)
  );
  try {
    if (donation.panelMessageId) {
      const msg = await channel.messages.fetch(donation.panelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [donateBtn] }).catch(() => {});
        return;
      }
    }
  } catch {}
  const sent = await channel.send({ embeds: [embed], components: [donateBtn] }).catch(() => null);
  if (sent) {
    donation.panelMessageId = sent.id;
    try {
      await apiFetch(`${BASE_URL}/internal/config/${guildId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donation }),
      });
    } catch {}
  }
}

async function fetchDonationData(guildId) {
  try {
    const r = await apiFetch(`${BASE_URL}/api/donations/${guildId}`);
    if (r) return await r.json();
  } catch {}
  return { donors: [], raised: 0 };
}

function buildDonationEmbed(config, donation, donationData) {
  const lang = config.language || 'en';
  const t = getLang(config);
  const colors = getColors(config);
  const raised = donationData.raised || 0;
  const goal = donation.goal || 0;
  const donors = donationData.donors || [];
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const filled = goal > 0 ? Math.round(pct / 5) : 0;
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);

  let desc = '';
  if (goal > 0) {
    desc += `> $**${raised.toLocaleString()}** / $${goal.toLocaleString()} · **${pct}%**\n`;
    desc += `\`${bar}\`\n`;
  }
  if (donation.message) desc += `\n${donation.message}\n`;
  if (donation.publicWall && donors.length) {
    const top = donors.slice(0, 3);
    desc += `\n**${t.donateRecent}**\n`;
    desc += top.map(d => `> <@${d.username}> — **$${d.amount}**`).join('\n');
  }
  desc += `\n\n*${t.donatePanelCTA}*`;

  return new EmbedBuilder()
    .setTitle(t.donatePanelTitle)
    .setDescription(desc)
    .setColor(colors.primary)
    .setFooter({ text: config.footerText || (lang === 'es' ? 'Gracias por tu apoyo' : 'Thank you for your support') })
    .setTimestamp();
}

async function updateDonationPanel(guildId) {
  try {
    const config = await getConfig(guildId);
    const donation = config.donation;
    if (!donation?.enabled || !donation?.channelId || !donation?.panelMessageId) return;
    const channel = client.channels.cache.get(donation.channelId) || await client.channels.fetch(donation.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(donation.panelMessageId).catch(() => null);
    if (!msg) return;
    const donationData = await fetchDonationData(guildId);
    const embed = buildDonationEmbed(config, donation, donationData);
    const donateBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`donate_start_${guildId}`).setLabel('Donate').setStyle(ButtonStyle.Success)
    );
    await msg.edit({ embeds: [embed], components: [donateBtn] }).catch(() => {});
  } catch (e) { console.error('[updateDonationPanel]', e.message); }
}

// ─── DONATION TICKET FLOW ────────────────────────────────────────────────────
async function handleDonateStart(interaction) {
  const guildId = interaction.customId.replace('donate_start_', '');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = await getConfig(guildId);
  const t = getLang(config);
  const colors = getColors(config);
  const donation = config.donation || {};
  const guild = interaction.guild;
  const member = interaction.member;
  const blacklist = config.blacklist || [];
  if (blacklist.some(b => b.userId === member.id)) {
    return interaction.editReply({ content: t.blacklisted });
  }
  const existing = [...sessions.values()].find(s => s.userId === member.id && s.guildId === guildId && s.type === 'donation');
  if (existing) return interaction.editReply({ content: t.donateAlreadyOpen(existing.channelId) });
  const anyOpen = [...sessions.values()].find(s => s.userId === member.id && s.guildId === guildId);
  if (anyOpen) return interaction.editReply({ content: t.alreadyOpen(anyOpen.channelId) });
  const permissionOverwrites = [
    { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
    { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];
  if (config.adminRole) permissionOverwrites.push({ id: config.adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const username = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const ticketChannel = await guild.channels.create({
    name: `donation-${username}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategory || null,
    permissionOverwrites,
    topic: `Donation from ${member.user.tag}`,
  });
  const session = {
    type: 'donation', channelId: ticketChannel.id, guildId,
    userId: member.id, username: member.user.tag,
    config, donation,
    donationAmount: null, donationMethod: null,
    paymentReference: null, paymentNote: null, paymentProof: null,
    phase: 'donation-amount', pendingModal: null, ticketMessageId: null,
    status: 'open', canType: false, reported: false, priority: 'normal',
    staffNotes: [], transcript: null,
    openedAt: Date.now(), pastTickets: [],
  };
  sessions.set(ticketChannel.id, session);
  syncTicket(session);
  const min = donation.min || 1;
  const embed = new EmbedBuilder()
    .setTitle('Donation')
    .setDescription(`Welcome <@${member.id}>\n\nHow much would you like to donate?\nMinimum: **$${min}**`)
    .setColor(colors.primary);
  const modal = new ModalBuilder().setCustomId(`modal_donate_amount_${ticketChannel.id}`).setTitle('Donation Amount');
  const input = new TextInputBuilder().setCustomId('amount').setLabel('Donation Amount (USD)')
    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 10, 25, 50');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  session.pendingModal = modal;
  const msg = await ticketChannel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_donate_amount_modal_${ticketChannel.id}`).setLabel('Enter Amount').setStyle(ButtonStyle.Primary)
    )]
  });
  session.ticketMessageId = msg.id;
  syncTicket(session);
  await interaction.editReply({ content: t.donateTicketReady(ticketChannel.id) });
}

async function handleDonateAmountModal(interaction) {
  const channelId = interaction.customId.replace('modal_donate_amount_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const raw = interaction.fields.getTextInputValue('amount').replace(/[$,]/g, '').trim();
  const amount = parseFloat(raw);
  const min = session.donation?.min || 1;
  if (isNaN(amount) || amount < min) {
    return interaction.reply({ content: `Minimum donation is **$${min}**.`, flags: MessageFlags.Ephemeral });
  }
  session.donationAmount = amount;
  session.pendingModal = null;
  session.phase = 'donation-method';
  const methods = session.config.paymentMethods || [];
  if (!methods.length) {
    await interaction.reply({ content: 'No payment methods configured. Contact an admin.', flags: MessageFlags.Ephemeral });
    return;
  }
  const select = new StringSelectMenuBuilder().setCustomId('select_donate_method').setPlaceholder('Select a payment method...')
    .addOptions(methods.map(m => ({ label: (PAYMENT_LABELS[m] || { label: m }).label, value: m })));
  const embed = new EmbedBuilder()
    .setTitle('Donation')
    .setDescription(`**$${amount}**\n\nChoose your payment method below.`)
    .setColor(colors.primary);
  const ticketMsg = session.ticketMessageId ? await interaction.channel.messages.fetch(session.ticketMessageId).catch(() => null) : null;
  if (ticketMsg) {
    await interaction.deferUpdate().catch(() => {});
    await ticketMsg.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] }).catch(() => {});
  } else {
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
  }
}

async function handleDonateMethodSelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const method = interaction.values[0];
  session.donationMethod = method;
  session.phase = 'donation-proof';
  const info = PAYMENT_LABELS[method] || { label: method };
  const account = (session.config.paymentAccounts || {})[method];
  const amount = session.donationAmount;
  const modal = new ModalBuilder().setCustomId(`modal_donate_proof_${interaction.channel.id}`).setTitle('Donation Proof');
  const refInput = new TextInputBuilder().setCustomId('reference').setLabel('Transaction ID / Reference (optional)')
    .setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. TXN123456789');
  const noteInput = new TextInputBuilder().setCustomId('note').setLabel('Note (optional)')
    .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300);
  modal.addComponents(new ActionRowBuilder().addComponents(refInput), new ActionRowBuilder().addComponents(noteInput));
  session.pendingModal = modal;
  const desc = [`**$${amount}** · **${info.label}**`];
  if (account) desc.push(`\nSend to: \`${account}\``);
  desc.push('\nClick **Submit Proof** after sending payment.');
  const embed = new EmbedBuilder()
    .setTitle('Payment')
    .setDescription(desc.join('\n'))
    .setColor(colors.warning);
  await interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_donate_proof_modal_${interaction.channel.id}`).setLabel('Submit Proof').setStyle(ButtonStyle.Success)
    )]
  });
}

async function handleDonateProofModal(interaction) {
  const channelId = interaction.customId.replace('modal_donate_proof_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  session.paymentReference = interaction.fields.getTextInputValue('reference').trim();
  session.paymentNote = interaction.fields.getTextInputValue('note').trim();
  session.pendingModal = null;
  session.phase = 'awaiting-donation-proof-image';
  await interaction.deferUpdate().catch(() => {});
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const embed = new EmbedBuilder()
    .setTitle('Proof')
    .setDescription('Now send your **payment screenshot** as an image in this channel, or type a message as confirmation.')
    .setColor(colors.primary);
  await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
  await setCanType(interaction.channel, session.userId, true);
}

async function handleDonateProofMessage(message, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  session.paymentProof = { text: message.content, imageUrl: message.attachments.first()?.url || null };
  session.phase = 'done';
  session.status = 'pending';
  await setCanType(message.channel, session.userId, false);
  await message.react('✅').catch(() => {});
  syncTicket(session);
  const embed = new EmbedBuilder()
    .setTitle('Donation Submitted')
    .setDescription('Your donation has been submitted for review.')
    .setColor(colors.success)
    .addFields(
      { name: 'Amount', value: `**$${session.donationAmount}**`, inline: true },
      { name: 'Method', value: `**${(PAYMENT_LABELS[session.donationMethod] || { label: session.donationMethod }).label}**`, inline: true },
      ...(session.paymentReference ? [{ name: 'Reference', value: session.paymentReference, inline: true }] : []),
      ...(session.paymentNote ? [{ name: 'Note', value: session.paymentNote }] : [])
    ).setTimestamp();
  if (session.paymentProof?.imageUrl) embed.setImage(session.paymentProof.imageUrl);
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`close_ticket_${message.channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
  );
  await message.channel.send({ embeds: [embed], components: [closeRow] });
  await notifyDonationAdmin(session);
}

async function notifyDonationAdmin(session) {
  if (!session.config.logChannel) return;
  const logChannel = client.channels.cache.get(session.config.logChannel) || await client.channels.fetch(session.config.logChannel).catch(() => null);
  if (!logChannel) return;
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const embed = new EmbedBuilder()
    .setTitle('Donation — Pending')
    .setColor(colors.warning)
    .addFields(
      { name: 'User', value: `<@${session.userId}>`, inline: true },
      { name: 'Amount', value: `**$${session.donationAmount}**`, inline: true },
      { name: 'Method', value: (PAYMENT_LABELS[session.donationMethod] || { label: session.donationMethod }).label, inline: true },
      { name: 'Ticket', value: `<#${session.channelId}>`, inline: true },
      ...(session.paymentReference ? [{ name: 'Reference', value: session.paymentReference, inline: true }] : []),
      ...(session.paymentNote ? [{ name: 'Note', value: session.paymentNote }] : [])
    ).setTimestamp();
  if (session.paymentProof?.imageUrl) embed.setImage(session.paymentProof.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`donation_approve_${session.channelId}`).setLabel('Approve Donation').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`donation_reject_${session.channelId}`).setLabel('Reject Donation').setStyle(ButtonStyle.Danger)
  );
  await logChannel.send({ embeds: [embed], components: [row] });
}

async function handleDonationApprove(interaction) {
  const channelId = interaction.customId.replace('donation_approve_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(`Approved by <@${interaction.user.id}>`).setColor(colors.success)],
    components: []
  });
  if (ticketChannel) {
    await generateAndSendTranscript(ticketChannel, session, 'Donation Approved');
    const embed = new EmbedBuilder().setTitle('Donation Approved').setDescription('Your donation has been approved and recorded. Thank you for your generous support!').setColor(colors.success).setTimestamp();
    if (session.ticketMessageId) {
      await editTicketMessage(ticketChannel, session, [embed], []);
    } else {
      await ticketChannel.send({ embeds: [embed] });
    }
    if (session) {
      session.status = 'approved';
      syncTicket(session);
      try {
        await apiFetch(`${BASE_URL}/api/donations/${session.guildId}/record`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.userId, username: session.username, amount: session.donationAmount, method: session.donationMethod }),
        });
        await updateDonationPanel(session.guildId);
      } catch (e) { console.error('[donation-approve]', e.message); }
    }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
}

async function handleDonationReject(interaction) {
  const channelId = interaction.customId.replace('donation_reject_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(`Rejected by <@${interaction.user.id}>`).setColor(colors.error)],
    components: []
  });
  if (ticketChannel) {
    await generateAndSendTranscript(ticketChannel, session, 'Donation Rejected');
    const embed = new EmbedBuilder().setTitle('Donation Rejected').setDescription('Your donation could not be verified. Please contact staff if you believe this is a mistake.\n\nThis ticket closes in 2 minutes.').setColor(colors.error).setTimestamp();
    if (session.ticketMessageId) {
      await editTicketMessage(ticketChannel, session, [embed], []);
    } else {
      await ticketChannel.send({ embeds: [embed] });
    }
    if (session) { session.status = 'rejected'; syncTicket(session); }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 120_000);
  }
}

// ─── COUPON HELPERS ─────────────────────────────────────────────────────────
function findValidCoupon(panel, code) {
  if (!panel.coupons?.length || !code) return null;
  const c = panel.coupons.find(c => c.code?.toLowerCase() === code.toLowerCase() && c.active !== false);
  if (!c) return null;
  if (c.expiresAt && Date.now() > c.expiresAt) return null;
  if (c.maxUses && (c.uses || 0) >= c.maxUses) return null;
  return c;
}
function applyCouponToUSD(usdTotal, coupon) {
  if (!coupon) return usdTotal;
  if (coupon.type === 'percent') return Math.max(0, usdTotal * (1 - coupon.value / 100));
  return Math.max(0, usdTotal - coupon.value);
}
async function incrementCouponUsage(guildId, panelId, code) {
  try {
    const panels = await getPanels(guildId);
    const p = panels.find(p => p.id === panelId) || panels.find(p => p.title === panelId);
    if (!p?.coupons) return;
    const c = p.coupons.find(c => c.code?.toLowerCase() === code.toLowerCase());
    if (c) { c.uses = (c.uses || 0) + 1; await savePanels(guildId, panels); }
  } catch (e) { console.error('[incrementCouponUsage]', e.message); }
}

async function proceedToCouponOrPayment(channel, session) {
  if (session.panel.coupons?.length) { session.phase = 'coupon'; return askCouponPrompt(channel, session); }
  session.phase = 'payment-select';
  return askPaymentSelect(channel, session);
}

async function askCouponPrompt(channel, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const modal = new ModalBuilder().setCustomId(`modal_coupon_${channel.id}`).setTitle('Coupon Code');
  const input = new TextInputBuilder().setCustomId('code').setLabel('Code')
    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. SAVE10');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  session.pendingModal = modal;
  const embed = new EmbedBuilder()
    .setDescription('Do you have a coupon code?')
    .setColor(colors.primary);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_couponmodal_${channel.id}`).setLabel('Enter Coupon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`skip_coupon_${channel.id}`).setLabel('Continue').setStyle(ButtonStyle.Primary)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function handleCouponModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_couponmodal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No coupon modal pending.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(session.pendingModal);
}

async function handleSkipCoupon(interaction) {
  const channelId = interaction.customId.replace('skip_coupon_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  await interaction.update({ components: [] }).catch(() => {});
  session.pendingModal = null;
  session.phase = 'payment-select';
  await askPaymentSelect(interaction.channel, session);
}

async function handleModalCoupon(interaction) {
  const channelId = interaction.customId.replace('modal_coupon_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const code = interaction.fields.getTextInputValue('code').trim();
  session.pendingModal = null;
  const coupon = findValidCoupon(session.panel, code);
  await interaction.deferUpdate().catch(() => {});

  if (!coupon) {
    await interaction.channel.send({ embeds: [new EmbedBuilder().setDescription(t.couponInvalid).setColor(colors.error)] });
    return askCouponPrompt(interaction.channel, session);
  }

  if (session.panel.type === 'currency' && session.total != null) {
    const currencies = getCurrencies(session.config);
    const currencyInfo = currencies.find(c => c.value === session.currency) || currencies[0];
    const usdBefore = session.totalUSD ?? (session.total * currencyInfo.rate);
    const usdAfter = applyCouponToUSD(usdBefore, coupon);
    session.total = parseFloat((usdAfter / currencyInfo.rate).toFixed(2));
    session.totalUSD = parseFloat(usdAfter.toFixed(2));
    session.totalDisplay = `${currencyInfo.symbol}${session.total.toLocaleString()} ${session.currency}`;
    session.appliedCoupon = coupon.code;
    incrementCouponUsage(session.guildId, session.panel.id || session.panel.title, coupon.code);
    await interaction.channel.send({ embeds: [new EmbedBuilder().setDescription(t.couponApplied(coupon.code, session.totalDisplay)).setColor(colors.success)] });
  } else {
    // Product / service panels: free-text pricing, so we note the coupon for the admin instead of auto-discounting.
    session.appliedCoupon = coupon.code;
    incrementCouponUsage(session.guildId, session.panel.id || session.panel.title, coupon.code);
    await interaction.channel.send({ embeds: [new EmbedBuilder().setDescription(t.couponNoted(coupon.code)).setColor(colors.success)] });
  }

  syncTicket(session);
  session.phase = 'payment-select';
  await askPaymentSelect(interaction.channel, session);
}

// ─── TRANSCRIPTS ────────────────────────────────────────────────────────────
async function generateAndSendTranscript(channel, session, reason) {
  if (!channel) return;
  try {
    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched) return;
    const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = sorted.map(m => {
      const attach = m.attachments.size ? ` [attachment: ${[...m.attachments.values()].map(a => a.url).join(', ')}]` : '';
      return `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content || ''}${attach}`;
    });
    const text = lines.join('\n') || 'No messages recorded.';
    const buffer = Buffer.from(text, 'utf-8');
    const fileName = `transcript-${channel.name}.txt`;

    if (session) {
      session.transcript = sorted.slice(-150).map(m => ({
        author: m.author.tag,
        content: (m.content || (m.attachments.size ? '[attachment]' : '')).slice(0, 500),
        timestamp: m.createdTimestamp,
      }));
    }

    const logChannelId = session?.config?.logChannel;
    if (logChannelId) {
      const logChannel = client.channels.cache.get(logChannelId) || await client.channels.fetch(logChannelId).catch(() => null);
      if (logChannel) {
        await logChannel.send({
          content: `📄 Transcript — **${session?.username || 'unknown user'}** — ${session?.panel?.title || ''} — _${reason}_`,
          files: [{ attachment: buffer, name: fileName }]
        }).catch(() => {});
      }
    }
  } catch (e) { console.error('[transcript]', e.message); }
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
      if (id.startsWith('open_qmodal_'))       return handleQuestionModalTrigger(interaction);
      if (id.startsWith('open_amount_modal_')) return handleAmountModalTrigger(interaction);
      if (id.startsWith('open_proof_modal_'))  return handleProofModalTrigger(interaction);
      if (id.startsWith('open_couponmodal_'))  return handleCouponModalTrigger(interaction);
      if (id.startsWith('skip_coupon_'))       return handleSkipCoupon(interaction);
      if (id.startsWith('donate_start_'))      return handleDonateStart(interaction);
      if (id.startsWith('donation_approve_'))  return handleDonationApprove(interaction);
      if (id.startsWith('donation_reject_'))   return handleDonationReject(interaction);
      if (id.startsWith('open_donate_amount_modal_')) return handleDonateAmountModalTrigger(interaction);
      if (id.startsWith('open_donate_proof_modal_'))  return handleDonateProofModalTrigger(interaction);
      if (id.startsWith('yesno_yes_'))  return handleYesNoAnswer(interaction, 'yes');
      if (id.startsWith('yesno_no_'))   return handleYesNoAnswer(interaction, 'no');
    }
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === 'select_currency')  return handleCurrencySelect(interaction);
      if (id === 'select_product')   return handleProductSelect(interaction);
      if (id === 'select_payment')   return handlePaymentSelect(interaction);
      if (id === 'select_donate_method') return handleDonateMethodSelect(interaction);
    }
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith('modal_question_')) return handleModalQuestion(interaction);
      if (id === 'modal_currency_amount')   return handleCurrencyAmountModal(interaction);
      if (id === 'modal_payment_proof')     return handlePaymentProofModal(interaction);
      if (id.startsWith('modal_coupon_'))   return handleModalCoupon(interaction);
      if (id.startsWith('modal_donate_amount_')) return handleDonateAmountModal(interaction);
      if (id.startsWith('modal_donate_proof_'))  return handleDonateProofModal(interaction);
    }
  } catch(e) { console.error(e); }
});

// ─── MODAL TRIGGER HANDLERS (called directly from global router) ───────────────
// Key insight: showModal() must be the very first await — no DB calls, no edits before it.

async function handleQuestionModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_qmodal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No question pending.', flags: MessageFlags.Ephemeral });
  // showModal FIRST — no awaits before this line
  await interaction.showModal(session.pendingModal);
  // Disable the trigger button after (non-blocking)
  interaction.message.edit({ components: [] }).catch(() => {});
}

async function handleAmountModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_amount_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No amount modal pending.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(session.pendingModal);
  interaction.message.edit({ components: [] }).catch(() => {});
}

async function handleProofModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_proof_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No proof modal pending.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(session.pendingModal);
  interaction.message.edit({ components: [] }).catch(() => {});
  session.phase = 'awaiting-proof-message';
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const channel = interaction.channel;
  setCanType(channel, session.userId, true).catch(() => {});
  const embed = new EmbedBuilder()
    .setDescription('Now send your **payment screenshot** as an image in this channel.')
    .setColor(colors.warning);
  channel.send({ embeds: [embed] }).catch(() => {});
}

async function handleDonateAmountModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_donate_amount_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No amount modal pending.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(session.pendingModal);
  interaction.message.edit({ components: [] }).catch(() => {});
}

async function handleDonateProofModalTrigger(interaction) {
  const channelId = interaction.customId.replace('open_donate_proof_modal_', '');
  const session = sessions.get(channelId);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (!session.pendingModal) return interaction.reply({ content: 'No proof modal pending.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(session.pendingModal);
  interaction.message.edit({ components: [] }).catch(() => {});
}

// ─── TICKET OPEN ───────────────────────────────────────────────────────────────
async function handleOpenTicket(interaction) {
  const [,, guildId, panelId] = interaction.customId.split('_');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const panels = await getPanels(guildId);
  let panel = panels.find(p => p.id === panelId);
  if (!panel) panel = panels[parseInt(panelId)];
  if (!panel) return interaction.editReply({ content: 'This panel no longer exists.' });
  const config = await getConfig(guildId);
  const t = getLang(config);
  const colors = getColors(config);
  const emojis = getEmojis(config);
  const guild  = interaction.guild;
  const member = interaction.member;

  const blacklist = config.blacklist || [];
  if (blacklist.some(b => b.userId === member.id)) {
    return interaction.editReply({ content: t.blacklisted });
  }

  const globalBan = getActiveGlobalBan(member.id);
  if (globalBan) {
    const until = globalBan.expiresAt ? new Date(globalBan.expiresAt).toLocaleString() : null;
    return interaction.editReply({ content: t.globalBanned(globalBan.reason, until) });
  }

  const suspension = getActiveSuspension(member.id);
  if (suspension) {
    const until = new Date(suspension.expiresAt).toLocaleString();
    return interaction.editReply({ content: t.suspended(suspension.reason, until) });
  }

  const existing = [...sessions.values()].find(s => s.userId === member.id && s.guildId === guildId);
  if (existing) return interaction.editReply({ content: t.alreadyOpen(existing.channelId) });

  const permissionOverwrites = [
    { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
    { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];
  if (config.adminRole) permissionOverwrites.push({ id: config.adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const ticketChannel = await guild.channels.create({
    name: resolveChannelName(config, panel.title, member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20), member.id),
    type: ChannelType.GuildText,
    parent: config.ticketCategory || null,
    permissionOverwrites,
    topic: `Ticket for ${member.user.tag} | ${panel.title}`,
  });

  const totalSteps = (panel.questions?.length || 0) + (panel.type === 'currency' ? 2 : 1) + 1;

  const session = {
    channelId: ticketChannel.id, guildId, panel, config,
    userId: member.id, username: member.user.tag,
    phase: 'questions', questionIndex: 0, answers: [],
    currency: null, currencyAmount: null, total: null, totalUSD: null,
    paymentMethod: null, selectedProduct: null, appliedCoupon: null,
    pendingModal: null, ticketMessageId: null,
    status: 'open', canType: false, reported: false, priority: 'normal',
    staffNotes: [], transcript: null,
    openedAt: Date.now(), pastTickets: [],
    totalSteps, currentStep: 0,
  };
  sessions.set(ticketChannel.id, session);
  syncTicket(session);

  const color = panel.color ? parseInt(panel.color.replace('#', ''), 16) : colors.primary;
  const welcomeEmbed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(config.welcomeMsg || t.welcome(`<@${member.id}>`))
    .setColor(color)
    .setFooter({ text: t.poweredBy });
  const msg = await ticketChannel.send({ embeds: [welcomeEmbed] });
  session.ticketMessageId = msg.id;
  syncTicket(session);

  await startNextStep(ticketChannel, session);
  await interaction.editReply({ content: t.ticketReady(ticketChannel.id) });
}

// ─── FLOW ──────────────────────────────────────────────────────────────────────
async function startNextStep(channel, session) {
  if (session.phase !== 'questions') return;
  const questions = session.panel.questions || [];
  if (session.questionIndex < questions.length) return askQuestion(channel, session);
  session.currentStep = questions.length;
  if (session.panel.type === 'currency') { session.phase = 'currency-select'; return askCurrencySelect(channel, session); }
  if (session.panel.type === 'product')  { session.phase = 'product-select';  return askProductSelect(channel, session); }
  return proceedToCouponOrPayment(channel, session);
}

async function askQuestion(channel, session) {
  const q = session.panel.questions[session.questionIndex];
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const step = session.questionIndex + 1;
  const total = session.panel.questions.length;
  session.currentStep = step - 1;

  const embed = new EmbedBuilder()
    .setDescription(`${stepIndicator(step, total)}\n\n**${q.text}**`)
    .setColor(colors.primary);

  if (q.type === 'image') {
    await setCanType(channel, session.userId, true);
    embed.setFooter({ text: 'Send an image or photo as your answer.' });
    if (session.ticketMessageId) {
      await editTicketMessage(channel, session, [embed], []);
    } else {
      const msg = await channel.send({ embeds: [embed] });
      session.ticketMessageId = msg.id;
    }
    session.phase = 'awaiting-image';
    return;
  }

  if (q.type === 'text' || q.type === 'number') {
    const modal = new ModalBuilder()
      .setCustomId(`modal_question_${channel.id}`)
      .setTitle(`Question ${step} of ${total}`);
    const input = new TextInputBuilder()
      .setCustomId('answer')
      .setLabel(q.text.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(q.required ?? true)
      .setPlaceholder(q.type === 'number' ? 'Numbers only...' : 'Type your answer...');
    if (q.maxLength) input.setMaxLength(q.maxLength);
    if (q.minLength) input.setMinLength(q.minLength);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    session.pendingModal = modal;

    embed.setFooter({ text: q.required ? 'Required' : 'Optional' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_qmodal_${channel.id}`).setLabel('Answer').setStyle(ButtonStyle.Primary)
    );
    if (session.ticketMessageId) {
      await editTicketMessage(channel, session, [embed], [row]);
    } else {
      const msg = await channel.send({ embeds: [embed], components: [row] });
      session.ticketMessageId = msg.id;
    }
    return;
  }

  if (q.type === 'user') {
    await setCanType(channel, session.userId, true);
    embed.setFooter({ text: 'Mention a user with @username' });
    if (session.ticketMessageId) {
      await editTicketMessage(channel, session, [embed], []);
    } else {
      const msg = await channel.send({ embeds: [embed] });
      session.ticketMessageId = msg.id;
    }
    session.phase = 'awaiting-user-mention';
    return;
  }

  if (q.type === 'yesno') {
    embed.setFooter({ text: 'Click a button to answer.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`yesno_yes_${channel.id}`).setLabel('Yes').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`yesno_no_${channel.id}`).setLabel('No').setStyle(ButtonStyle.Danger),
    );
    if (session.ticketMessageId) {
      await editTicketMessage(channel, session, [embed], [row]);
    } else {
      const msg = await channel.send({ embeds: [embed], components: [row] });
      session.ticketMessageId = msg.id;
    }
    session.phase = 'awaiting-yesno';
    return;
  }
}

async function handleModalQuestion(interaction) {
  const channelId = interaction.customId.replace('modal_question_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const q = session.panel.questions[session.questionIndex];
  let answer = interaction.fields.getTextInputValue('answer').trim();
  if (q.type === 'number' && isNaN(answer.replace(/,/g, ''))) return interaction.reply({ content: t.pleaseValidNum, flags: MessageFlags.Ephemeral });
  await interaction.deferUpdate().catch(() => {});
  session.answers.push({ question: q.text, answer: answer || '*(skipped)*', type: q.type });
  session.questionIndex++;
  session.pendingModal = null;
  syncTicket(session);

  const embed = new EmbedBuilder()
    .setDescription(`> **${q.text}**\n> ${answer || '*(skipped)*'}`)
    .setColor(colors.success);
  await interaction.channel.send({ embeds: [embed] });

  session.phase = 'questions';
  await startNextStep(interaction.channel, session);
}

async function handleYesNoAnswer(interaction, answer) {
  const channelId = interaction.customId.replace('yesno_yes_', '').replace('yesno_no_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  if (session.phase !== 'awaiting-yesno') return interaction.reply({ content: 'No yes/no question pending.', flags: MessageFlags.Ephemeral });
  const q = session.panel.questions[session.questionIndex];
  await interaction.deferUpdate().catch(() => {});
  session.answers.push({ question: q.text, answer, type: 'yesno' });
  session.questionIndex++;
  session.phase = 'questions';
  syncTicket(session);

  const action = answer === 'yes' ? (q.yesAction || 'continue') : (q.noAction || 'cancel');
  const msgText = answer === 'yes' ? (q.yesMessage || '') : (q.noMessage || '');

  const ackEmbed = new EmbedBuilder()
    .setDescription(`> **${q.text}**\n> **${answer === 'yes' ? 'Yes' : 'No'}**`)
    .setColor(colors.success);
  await interaction.channel.send({ embeds: [ackEmbed] });

  if (action === 'cancel') {
    const cancelEmbed = new EmbedBuilder()
      .setTitle('Ticket Cancelled')
      .setDescription(msgText || 'This ticket has been cancelled based on your response.')
      .setColor(colors.error)
      .setTimestamp();
    if (session.ticketMessageId) {
      await editTicketMessage(interaction.channel, session, [cancelEmbed], []);
    } else {
      await interaction.channel.send({ embeds: [cancelEmbed] });
    }
    syncTicket({ ...session, status: 'cancelled' });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); sessions.delete(channelId); }, 10_000);
    return;
  }

  if (action === 'message' && msgText) {
    const infoEmbed = new EmbedBuilder().setDescription(msgText).setColor(colors.primary);
    await interaction.channel.send({ embeds: [infoEmbed] });
  }

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

  if (session.phase === 'awaiting-donation-proof-image') {
    await handleDonateProofMessage(message, session);
    return;
  }
});

// ─── CURRENCY ──────────────────────────────────────────────────────────────────
async function askCurrencySelect(channel, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const currencies = getCurrencies(session.config);
  const questions = session.panel.questions || [];
  session.currentStep = questions.length + 1;
  const select = new StringSelectMenuBuilder().setCustomId('select_currency').setPlaceholder('Select your currency...')
    .addOptions(currencies.slice(0, 25).map(c => ({ label: c.label, value: c.value })));
  const embed = new EmbedBuilder()
    .setDescription(`${stepIndicator(session.currentStep, session.totalSteps)}\n\n**Select your currency**\nThis determines the total amount you will pay.`)
    .setColor(colors.primary);
  if (session.ticketMessageId) {
    await editTicketMessage(channel, session, [embed], [new ActionRowBuilder().addComponents(select)]);
  } else {
    const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    session.ticketMessageId = msg.id;
  }
}

async function handleCurrencySelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  session.currency = interaction.values[0];
  session.phase = 'currency-amount';

  const embed = new EmbedBuilder()
    .setDescription(`${stepIndicator(session.currentStep, session.totalSteps)}\n\nCurrency selected: **${session.currency}**`)
    .setColor(colors.success);
  await interaction.update({ embeds: [embed], components: [] });

  const modal = new ModalBuilder().setCustomId('modal_currency_amount').setTitle(`Amount — ${session.panel.title.slice(0, 20)}`);
  const input = new TextInputBuilder().setCustomId('amount').setLabel('Amount (e.g. 1000, 500, 250)')
    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Enter a number...');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  session.pendingModal = modal;

  const msgEmbed = new EmbedBuilder()
    .setDescription(`${stepIndicator(session.currentStep, session.totalSteps)}\n\nEnter the amount of **${session.panel.title}** you want.`)
    .setColor(colors.primary);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_amount_modal_${interaction.channel.id}`).setLabel('Enter Amount').setStyle(ButtonStyle.Primary)
  );
  await interaction.channel.send({ embeds: [msgEmbed], components: [row] });
}

async function handleCurrencyAmountModal(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const raw = interaction.fields.getTextInputValue('amount').replace(/,/g, '').trim();
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) return interaction.reply({ content: t.pleaseValidNumber, flags: MessageFlags.Ephemeral });
  const { panel } = session;
  if (!panel.baseAmount) return interaction.reply({ content: t.pleaseValidNumber, flags: MessageFlags.Ephemeral });
  const currencies = getCurrencies(session.config);
  const currencyInfo = currencies.find(c => c.value === session.currency) || currencies[0];
  const usdTotal = (amount / panel.baseAmount) * panel.basePrice * (1 + (panel.margin ?? 15) / 100);
  const localTotal = usdTotal / currencyInfo.rate;
  session.currencyAmount = amount;
  session.total = parseFloat(localTotal.toFixed(2));
  session.totalUSD = parseFloat(usdTotal.toFixed(2));
  session.totalDisplay = `${currencyInfo.symbol}${session.total.toLocaleString()} ${session.currency}`;
  session.selectedProduct = `${amount.toLocaleString()} ${panel.title}`;
  session.pendingModal = null;
  await interaction.deferUpdate().catch(() => {});

  const embed = new EmbedBuilder()
    .setTitle('Order Summary')
    .setColor(colors.success)
    .addFields(
      { name: 'Item', value: panel.title, inline: true },
      { name: 'Amount', value: `${amount.toLocaleString()}`, inline: true },
      { name: 'Total', value: `**${session.totalDisplay}**`, inline: false }
    )
    .setFooter({ text: 'Price includes service fee.' });
  await interaction.channel.send({ embeds: [embed] });
  syncTicket(session);
  await proceedToCouponOrPayment(interaction.channel, session);
}

// ─── PRODUCT ───────────────────────────────────────────────────────────────────
async function askProductSelect(channel, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const { products } = session.panel;
  if (!products?.length) return proceedToCouponOrPayment(channel, session);
  const questions = session.panel.questions || [];
  session.currentStep = questions.length + 1;
  const select = new StringSelectMenuBuilder().setCustomId('select_product').setPlaceholder('Select a product...')
    .addOptions(products.map(p => ({ label: p.name, description: String(p.price), value: p.name })));
  const embed = new EmbedBuilder()
    .setDescription(`${stepIndicator(session.currentStep, session.totalSteps)}\n\n**Select the product you want to purchase:**`)
    .setColor(colors.primary);
  if (session.ticketMessageId) {
    await editTicketMessage(channel, session, [embed], [new ActionRowBuilder().addComponents(select)]);
  } else {
    const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    session.ticketMessageId = msg.id;
  }
}

async function handleProductSelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const product = session.panel.products.find(p => p.name === interaction.values[0]);
  session.selectedProduct = product.name;
  session.totalDisplay = product.price;
  const parsed = parseFloat(String(product.price).replace(/[^0-9.]/g, ''));
  session.totalUSD = isNaN(parsed) ? null : parsed;

  const embed = new EmbedBuilder()
    .setDescription(`**Selected:** ${product.name}\n**Price:** ${product.price}`)
    .setColor(colors.success);
  await interaction.update({ embeds: [embed], components: [] });
  syncTicket(session);
  await proceedToCouponOrPayment(interaction.channel, session);
}

// ─── PAYMENT ───────────────────────────────────────────────────────────────────
async function askPaymentSelect(channel, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const methods = session.config.paymentMethods || ['paypal', 'crypto_usdt'];
  if (!methods.length) {
    const embed = new EmbedBuilder().setDescription('No payment methods configured. Contact an admin.').setColor(colors.error);
    if (session.ticketMessageId) await editTicketMessage(channel, session, [embed], []);
    else await channel.send({ embeds: [embed] });
    return;
  }
  const totalText = session.totalDisplay || 'as agreed';
  const select = new StringSelectMenuBuilder().setCustomId('select_payment').setPlaceholder('Choose your payment method...')
    .addOptions(methods.map(m => ({ label: (PAYMENT_LABELS[m] || { label: m }).label, value: m })));
  const embed = new EmbedBuilder()
    .setDescription(`**Choose your payment method**\n\nTotal: **${totalText}**`)
    .setColor(colors.primary);
  if (session.ticketMessageId) {
    await editTicketMessage(channel, session, [embed], [new ActionRowBuilder().addComponents(select)]);
  } else {
    const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    session.ticketMessageId = msg.id;
  }
}

async function handlePaymentSelect(interaction) {
  const session = sessions.get(interaction.channel.id);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  const method = interaction.values[0];
  session.paymentMethod = method;
  const info = PAYMENT_LABELS[method] || { label: method };
  const account = (session.config.paymentAccounts || {})[method];
  const totalText = session.totalDisplay || 'as agreed';

  const modal = new ModalBuilder().setCustomId('modal_payment_proof').setTitle('Payment Confirmation');
  const refInput = new TextInputBuilder().setCustomId('reference').setLabel('Transaction ID / Reference (optional)')
    .setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. TXN123456789');
  const noteInput = new TextInputBuilder().setCustomId('note').setLabel('Additional note (optional)')
    .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300);
  modal.addComponents(new ActionRowBuilder().addComponents(refInput), new ActionRowBuilder().addComponents(noteInput));
  session.pendingModal = modal;

  const embed = new EmbedBuilder()
    .setTitle(`Pay with ${info.label}`)
    .setDescription('Send the payment then submit your proof of payment.')
    .setColor(colors.warning)
    .addFields(
      { name: 'Amount', value: `**${totalText}**`, inline: true },
      ...(account ? [{ name: 'Send to', value: `\`${account}\``, inline: true }] : [])
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_proof_modal_${interaction.channel.id}`).setLabel('Submit Proof').setStyle(ButtonStyle.Success)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function handlePaymentProofModal(interaction) {
  const session = sessions.get(interaction.channel.id);
  if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your ticket.', flags: MessageFlags.Ephemeral });
  session.paymentReference = interaction.fields.getTextInputValue('reference').trim();
  session.paymentNote = interaction.fields.getTextInputValue('note').trim();
  session.pendingModal = null;
  await interaction.deferUpdate().catch(() => {});
}

// ─── FINISH ────────────────────────────────────────────────────────────────────
async function finishTicket(channel, session) {
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const embed = new EmbedBuilder()
    .setTitle('Purchase Submitted')
    .setDescription('Your order has been submitted and is pending verification. An admin will confirm shortly.')
    .setColor(colors.success)
    .addFields(
      { name: 'Product', value: session.selectedProduct || session.panel.title, inline: true },
      { name: 'Payment', value: PAYMENT_LABELS[session.paymentMethod]?.label || session.paymentMethod, inline: true },
      ...(session.totalDisplay ? [{ name: 'Total', value: session.totalDisplay, inline: true }] : [])
    )
    .setTimestamp();
  if (session.ticketMessageId) {
    await editTicketMessage(channel, session, [embed], []);
  } else {
    await channel.send({ embeds: [embed] });
  }
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`close_ticket_${channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ components: [closeRow] });
  await notifyAdmin(session);
}

async function notifyAdmin(session) {
  if (!session.config.logChannel) return;
  const logChannel = client.channels.cache.get(session.config.logChannel) || await client.channels.fetch(session.config.logChannel).catch(() => null);
  if (!logChannel) return;
  const t = getLang(session.config);
  const colors = getColors(session.config);
  const embed = new EmbedBuilder()
    .setTitle('New Purchase — Pending Verification')
    .setColor(colors.warning)
    .addFields(
      { name: 'User', value: `<@${session.userId}> (${session.username})`, inline: true },
      { name: 'Panel', value: session.panel.title, inline: true },
      { name: 'Ticket', value: `<#${session.channelId}>`, inline: true },
      { name: 'Payment', value: PAYMENT_LABELS[session.paymentMethod]?.label || session.paymentMethod || 'N/A', inline: true },
      ...(session.totalDisplay ? [{ name: 'Total', value: session.totalDisplay, inline: true }] : []),
      ...(session.appliedCoupon ? [{ name: 'Coupon', value: session.appliedCoupon, inline: true }] : []),
      ...(session.paymentReference ? [{ name: 'Reference', value: session.paymentReference, inline: true }] : []),
      ...session.answers.map(a => ({ name: a.question.slice(0, 256), value: String(a.answer).slice(0, 1024), inline: true })),
      ...(session.paymentNote ? [{ name: 'Note', value: session.paymentNote }] : [])
    )
    .setTimestamp();
  if (session.paymentProof?.imageUrl) embed.setImage(session.paymentProof.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`admin_approve_${session.channelId}`).setLabel('Approve & Deliver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`admin_reject_${session.channelId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  await logChannel.send({ embeds: [embed], components: [row] });
}

// ─── ADMIN BUTTONS ─────────────────────────────────────────────────────────────
async function handleAdminApprove(interaction) {
  const channelId = interaction.customId.replace('admin_approve_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(`Approved by <@${interaction.user.id}>`).setColor(colors.success)],
    components: []
  });
  if (ticketChannel) {
    const approvedMsg = session?.config?.approvedMsg || 'Your payment was confirmed. Items will be delivered shortly. Thank you!';
    await generateAndSendTranscript(ticketChannel, session, 'Approved');
    const embed = new EmbedBuilder().setTitle('Order Approved').setDescription(approvedMsg).setColor(colors.success).setTimestamp();
    if (session.ticketMessageId) {
      await editTicketMessage(ticketChannel, session, [embed], []);
    } else {
      await ticketChannel.send({ embeds: [embed] });
    }
    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`close_ticket_${channelId}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    );
    await ticketChannel.send({ components: [closeRow] });
    if (session) { session.status = 'approved'; syncTicket(session); }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 60_000);
  }
}

async function handleAdminReject(interaction) {
  const channelId = interaction.customId.replace('admin_reject_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  const ticketChannel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  await interaction.update({
    embeds: [...interaction.message.embeds, new EmbedBuilder().setDescription(`Rejected by <@${interaction.user.id}>`).setColor(colors.error)],
    components: []
  });
  if (ticketChannel) {
    const rejectedMsg = session?.config?.rejectedMsg || 'Payment could not be verified. Contact an admin if this is a mistake.\n\nThis channel closes in 2 minutes.';
    await generateAndSendTranscript(ticketChannel, session, 'Rejected');
    const embed = new EmbedBuilder().setTitle('Order Rejected').setDescription(rejectedMsg).setColor(colors.error).setTimestamp();
    if (session.ticketMessageId) {
      await editTicketMessage(ticketChannel, session, [embed], []);
    } else {
      await ticketChannel.send({ embeds: [embed] });
    }
    if (session) { session.status = 'rejected'; syncTicket(session); }
    setTimeout(() => { ticketChannel.delete().catch(() => {}); sessions.delete(channelId); }, 120_000);
  }
}

async function handleCloseTicket(interaction) {
  const channelId = interaction.customId.replace('close_ticket_', '');
  const session = sessions.get(channelId);
  const t = getLang(session?.config);
  const colors = getColors(session?.config);
  const hasPermission = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    || (session?.config?.adminRole && interaction.member.roles.cache.has(session.config.adminRole));
  if (!hasPermission)
    return interaction.reply({ content: 'Only staff can close tickets.', flags: MessageFlags.Ephemeral });
  const closedMsg = session?.config?.closedMsg || 'Ticket closed.';
  await interaction.reply({ content: closedMsg });
  await generateAndSendTranscript(interaction.channel, session, 'Closed');
  if (session) { session.status = 'closed'; syncTicket(session); }
  setTimeout(() => { interaction.channel.delete().catch(() => {}); sessions.delete(channelId); }, 5000);
}

async function setCanType(channel, userId, canType) {
  try { await channel.permissionOverwrites.edit(userId, { SendMessages: canType, AttachFiles: canType }); }
  catch (e) { console.error('[setCanType]', e.message); }
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[LOGIN ERROR]', err);
});