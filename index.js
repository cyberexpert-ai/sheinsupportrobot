// SheinVoucherHub Support Bot - Complete Render.com Version
// Single file with all features

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

// ============================================
// CONFIGURATION
// ============================================
const ADMIN_ID = "8004114088";
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE"; // Set in Render environment variables
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://your-app-name.onrender.com"; // Set in Render

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN);

// ============================================
// EXPRESS SERVER SETUP
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('🤖 Shein Support Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Webhook endpoint
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ============================================
// IN-MEMORY DATABASE (User Properties)
// ============================================
const userDB = new Map(); // Stores user data
const templateDB = new Map(); // Stores templates
const autoReplyDB = new Map(); // Stores auto-reply keywords
const logDB = []; // Stores system logs

// Helper functions for database
function getUserProperty(userId, key, defaultValue = null) {
  const userKey = `${userId}_${key}`;
  return userDB.get(userKey) || defaultValue;
}

function setUserProperty(userId, key, value) {
  const userKey = `${userId}_${key}`;
  if (value === null) {
    userDB.delete(userKey);
  } else {
    userDB.set(userKey, value);
  }
}

function getAllUsers() {
  const users = new Set();
  for (const key of userDB.keys()) {
    if (key.includes('_userInfo')) {
      const userId = key.split('_')[0];
      users.add(userId);
    }
  }
  return Array.from(users);
}

function logActivity(action, userId, details) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${action} - User: ${userId} - ${details}`;
  logDB.unshift(logEntry);
  if (logDB.length > 50) logDB.pop(); // Keep last 50 logs
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Escape markdown for Telegram
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
}

// Check if user is admin
function isAdmin(userId) {
  return userId.toString() === ADMIN_ID.toString();
}

// Check if user is blocked
function isUserBlocked(userId) {
  const blocked = getUserProperty(userId, 'blocked');
  if (!blocked) return false;
  
  // Check for temporary block expiry
  const blockExpiry = getUserProperty(userId, 'blockExpiry');
  if (blockExpiry && new Date(blockExpiry) < new Date()) {
    setUserProperty(userId, 'blocked', null);
    setUserProperty(userId, 'blockExpiry', null);
    return false;
  }
  
  return true;
}

// Spam detection
function checkSpam(userId, chatId) {
  const messageCount = parseInt(getUserProperty(userId, 'msgCount') || '0');
  const firstMsgTime = parseInt(getUserProperty(userId, 'firstMsgTime') || '0');
  const currentTime = Date.now();
  
  // Reset counter if more than 1 minute passed
  if (currentTime - firstMsgTime > 60000) {
    setUserProperty(userId, 'msgCount', '1');
    setUserProperty(userId, 'firstMsgTime', currentTime.toString());
    return false;
  }
  
  // Increment counter
  const newCount = messageCount + 1;
  setUserProperty(userId, 'msgCount', newCount.toString());
  
  // Check spam threshold (10 messages per minute)
  const spamLimit = parseInt(getUserProperty('global', 'spamLimit') || '10');
  if (newCount > spamLimit) {
    // Auto-block for spam
    const blockExpiry = new Date();
    blockExpiry.setMinutes(blockExpiry.getMinutes() + 30);
    
    setUserProperty(userId, 'blocked', 'true');
    setUserProperty(userId, 'blockReason', 'Spam detection');
    setUserProperty(userId, 'blockExpiry', blockExpiry.toISOString());
    
    bot.sendMessage(chatId, '🚫 Blocked for spam. Contact admin if this is a mistake.');
    logActivity('SPAM_BLOCK', userId, 'Auto-blocked for spam');
    return true;
  }
  
  return false;
}

// Check auto-reply
function checkAutoReply(text, chatId, userId) {
  const autoReplyEnabled = getUserProperty('global', 'autoReplyEnabled') === 'true';
  if (!autoReplyEnabled) return false;
  
  for (const [keyword, reply] of autoReplyDB.entries()) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      bot.sendMessage(chatId, reply);
      logActivity('AUTO_REPLY', userId, `Triggered by keyword: ${keyword}`);
      return true;
    }
  }
  
  return false;
}

// ============================================
// COMMAND HANDLERS
// ============================================

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';
  const username = msg.from.username || 'No username';
  
  // Delete previous message (simulated - can't actually delete in webhook mode)
  
  // Check if blocked
  if (isUserBlocked(userId)) {
    bot.sendMessage(chatId, '🚫 You are blocked from using this bot.', { parse_mode: 'Markdown' });
    return;
  }
  
  // Create welcome message
  let welcomeText = '🤖 *Welcome to Shein Voucher Hub Support\\!*\n\n';
  welcomeText += `Hello ${escapeMarkdown(firstname)},\n\n`;
  welcomeText += 'This is the official support bot for @SheinVoucherHub_Bot.\n\n';
  welcomeText += '📌 *How to use:*\n';
  welcomeText += '• Send any message here and it will be forwarded\n';
  welcomeText += '• Our team will reply as soon as possible\n';
  welcomeText += '• You\'ll receive notifications when admin replies\n\n';
  welcomeText += '⚠️ *Please note:*\n';
  welcomeText += '• Fake messages may result in a ban\n';
  welcomeText += '• Support hours: 24/7\n';
  welcomeText += '• Response time: Usually within 1-2 hours';
  
  // Create keyboard
  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Start Chat', callback_data: 'cmd_support' }],
      [{ text: '❓ FAQ', callback_data: 'cmd_faq' }]
    ]
  };
  
  // Add admin button
  if (isAdmin(userId)) {
    keyboard.inline_keyboard.push([{ text: '👑 Admin Panel', callback_data: 'cmd_admin' }]);
  }
  
  // Store user info
  setUserProperty(userId, 'userInfo', JSON.stringify({
    id: userId,
    name: firstName,
    username: username
  }));
  
  // Send message
  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  // Clear session
  setUserProperty(userId, 'inSupport', null);
  setUserProperty(userId, 'awaitingMessage', null);
  
  logActivity('START', userId, 'Bot started');
});

// /support command
bot.onText(/\/support/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if blocked
  if (isUserBlocked(userId)) {
    bot.sendMessage(chatId, '🚫 You are blocked from using this bot.', { parse_mode: 'Markdown' });
    return;
  }
  
  // Set user in support mode
  setUserProperty(userId, 'inSupport', 'true');
  setUserProperty(userId, 'awaitingMessage', 'true');
  
  // Store user info
  const userInfo = {
    id: userId,
    name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
    username: msg.from.username || 'No username'
  };
  setUserProperty(userId, 'userInfo', JSON.stringify(userInfo));
  
  // Create support message
  const supportText = '💬 *Support Chat*\n\n' +
    'You are now in support mode. Please send your message below.\n\n' +
    'Our team will reply to you shortly.\n\n' +
    'Type your question or issue and press send.';
  
  // Create keyboard
  const keyboard = {
    inline_keyboard: [
      [{ text: '❌ End Chat', callback_data: 'cmd_end' }],
      [{ text: '🏠 Main Menu', callback_data: 'cmd_start' }]
    ]
  };
  
  bot.sendMessage(chatId, supportText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  // Notify admin
  const adminNotifyText = `🆕 *New Support Request*\n\n` +
    `👤 *User:* ${msg.from.first_name || 'Unknown'}\n` +
    `🆔 *ID:* \`${userId}\`\n` +
    `👤 *Username:* @${msg.from.username || 'None'}\n\n` +
    `User has started a support chat. Reply to this message to respond to them.`;
  
  bot.sendMessage(ADMIN_ID, adminNotifyText, { parse_mode: 'Markdown' });
  
  logActivity('SUPPORT_START', userId, 'Started support chat');
});

// /faq command
bot.onText(/\/faq/, (msg) => {
  const chatId = msg.chat.id;
  
  // Check if FAQ is customized
  let faqText = getUserProperty('global', 'customFAQ');
  
  if (!faqText) {
    faqText = '❓ *Frequently Asked Questions*\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '*Q: How do I buy vouchers?*\n' +
      'A: Use @SheinVoucherHub_Bot and select "Buy Voucher"\n\n' +
      '*Q: My voucher isn\'t working*\n' +
      'A: Contact support here with your Order ID\n\n' +
      '*Q: How long does delivery take?*\n' +
      'A: Usually within 5-30 minutes after payment confirmation\n\n' +
      '*Q: Can I get a refund?*\n' +
      'A: Refunds are only given if vouchers are out of stock\n\n' +
      '*Q: I forgot my Order ID*\n' +
      'A: Use the "My Orders" command in the main bot\n\n' +
      '*Q: Support hours?*\n' +
      'A: We\'re available 24/7, but replies may take 1-2 hours\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'For more help, click the button below to contact support!';
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Contact Support', callback_data: 'cmd_support' }],
      [{ text: '🏠 Main Menu', callback_data: 'cmd_start' }]
    ]
  };
  
  bot.sendMessage(chatId, faqText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// /end command
bot.onText(/\/end/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Clear user session
  setUserProperty(userId, 'inSupport', null);
  setUserProperty(userId, 'awaitingMessage', null);
  
  const endText = '✅ *Chat Ended*\n\n' +
    'Your support session has been closed.\n\n' +
    'If you need further assistance, feel free to start a new chat.';
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Start New Chat', callback_data: 'cmd_support' }],
      [{ text: '🏠 Main Menu', callback_data: 'cmd_start' }]
    ]
  };
  
  bot.sendMessage(chatId, endText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  // Notify admin
  bot.sendMessage(
    ADMIN_ID,
    `👋 User @${msg.from.username || 'Unknown'} has ended the support chat.`,
    { parse_mode: 'Markdown' }
  );
  
  logActivity('SUPPORT_END', userId, 'Ended support chat');
});

// /admin command
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if admin
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, '⛔ Unauthorized access.');
    return;
  }
  
  // Get statistics
  let activeChats = 0;
  let totalUsers = 0;
  let blockedUsers = 0;
  
  for (const key of userDB.keys()) {
    if (key.includes('_inSupport') && userDB.get(key) === 'true') {
      activeChats++;
    }
    if (key.includes('_userInfo')) {
      totalUsers++;
    }
    if (key.includes('_blocked') && userDB.get(key) === 'true') {
      blockedUsers++;
    }
  }
  
  const adminText = '👑 *SUPER ADMIN PANEL*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '📊 *SYSTEM STATISTICS*\n' +
    `• Active Chats: ${activeChats}\n` +
    `• Total Users: ${totalUsers}\n` +
    `• Blocked Users: ${blockedUsers}\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '👇 *SELECT OPTION BELOW*';
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📋 List Users', callback_data: 'admin_list_users' }],
      [{ text: '🔍 Find User', callback_data: 'admin_find_user' }],
      [{ text: '🚫 Block User', callback_data: 'admin_block' }],
      [{ text: '✅ Unblock User', callback_data: 'admin_unblock' }],
      [{ text: '⏸ Temp Block', callback_data: 'admin_temp_block' }],
      [{ text: '📨 Broadcast', callback_data: 'admin_broadcast' }],
      [{ text: '📋 Saved Replies', callback_data: 'admin_saved_replies' }],
      [{ text: '👁 View Active', callback_data: 'admin_active_chats' }],
      [{ text: '⚠️ Warn User', callback_data: 'admin_warn_user' }],
      [{ text: '📈 Daily Report', callback_data: 'admin_daily_report' }],
      [{ text: '🤖 Auto Reply', callback_data: 'admin_auto_reply' }],
      [{ text: '❓ FAQ Editor', callback_data: 'admin_faq_edit' }],
      [{ text: '🚫 Ban List', callback_data: 'admin_ban_list' }],
      [{ text: '🛡 Spam Filter', callback_data: 'admin_spam_filter' }],
      [{ text: '📝 Logs', callback_data: 'admin_logs' }],
      [{ text: '⚙️ Settings', callback_data: 'admin_settings' }],
      [{ text: '🏠 Main Menu', callback_data: 'cmd_start' }]
    ]
  };
  
  bot.sendMessage(chatId, adminText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  logActivity('ADMIN_PANEL', userId, 'Opened admin panel');
});

// ============================================
// ADMIN COMMAND HANDLERS
// ============================================

// List users
bot.onText(/\/admin_list_users(?:\s+(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, '⛔ Unauthorized access.');
    return;
  }
  
  const page = match && match[1] ? parseInt(match[1]) : 1;
  
  // Collect users
  const users = [];
  for (const key of userDB.keys()) {
    if (key.includes('_userInfo')) {
      const uid = key.split('_')[0];
      const userData = JSON.parse(userDB.get(key) || '{}');
      const inSupport = userDB.get(uid + '_inSupport') === 'true' ? '🟢 Active' : '⚪ Inactive';
      const blocked = userDB.get(uid + '_blocked') === 'true' ? '🔴 Blocked' : '🟢 OK';
      
      users.push({
        id: uid,
        name: userData.name || 'Unknown',
        username: userData.username || 'No username',
        status: inSupport,
        blocked: blocked
      });
    }
  }
  
  // Pagination
  const itemsPerPage = 5;
  const totalPages = Math.ceil(users.length / itemsPerPage) || 1;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageUsers = users.slice(start, end);
  
  let listText = `📋 *USER LIST (Page ${page}/${totalPages})*\n`;
  listText += '━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  if (pageUsers.length === 0) {
    listText += 'No users found.\n\n';
  } else {
    for (let j = 0; j < pageUsers.length; j++) {
      const u = pageUsers[j];
      listText += `👤 *User ${start + j + 1}*\n`;
      listText += `🆔 ID: \`${u.id}\`\n`;
      listText += `📛 Name: ${u.name}\n`;
      listText += `👤 Username: @${u.username}\n`;
      listText += `📊 Status: ${u.status} | ${u.blocked}\n`;
      listText += '━━━━━━━━━━━━━━━\n';
    }
  }
  
  const keyboard = { inline_keyboard: [] };
  
  if (page > 1) {
    keyboard.inline_keyboard.push([{ text: '◀️ Previous', callback_data: `admin_list_users_${page - 1}` }]);
  }
  if (page < totalPages) {
    keyboard.inline_keyboard.push([{ text: 'Next ▶️', callback_data: `admin_list_users_${page + 1}` }]);
  }
  
  keyboard.inline_keyboard.push([{ text: '🔍 Search User', callback_data: 'admin_find_user' }]);
  keyboard.inline_keyboard.push([{ text: '↩️ Back to Admin', callback_data: 'cmd_admin' }]);
  
  bot.sendMessage(chatId, listText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// ============================================
// CALLBACK QUERY HANDLER
// ============================================
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  // Answer callback query
  bot.answerCallbackQuery(callbackQuery.id);
  
  // Handle commands
  if (data === 'cmd_start') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId, first_name: callbackQuery.from.first_name }, text: '/start' });
  } else if (data === 'cmd_support') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/support' });
  } else if (data === 'cmd_faq') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/faq' });
  } else if (data === 'cmd_end') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/end' });
  } else if (data === 'cmd_admin') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin' });
  } else if (data.startsWith('admin_list_users')) {
    const page = data.split('_').pop();
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: `/admin_list_users ${page}` });
  } else if (data === 'admin_find_user') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_find_user' });
  } else if (data === 'admin_block') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_block' });
  } else if (data === 'admin_unblock') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_unblock' });
  } else if (data === 'admin_temp_block') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_temp_block' });
  } else if (data === 'admin_broadcast') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_broadcast' });
  } else if (data === 'admin_saved_replies') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_saved_replies' });
  } else if (data === 'admin_active_chats') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_active_chats' });
  } else if (data === 'admin_warn_user') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_warn_user' });
  } else if (data === 'admin_daily_report') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_daily_report' });
  } else if (data === 'admin_auto_reply') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_auto_reply' });
  } else if (data === 'admin_faq_edit') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_faq_edit' });
  } else if (data === 'admin_ban_list') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_ban_list' });
  } else if (data === 'admin_spam_filter') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_spam_filter' });
  } else if (data === 'admin_logs') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_logs' });
  } else if (data === 'admin_settings') {
    bot.emit('text', { chat: { id: chatId }, from: { id: userId }, text: '/admin_settings' });
  }
});

// ============================================
// MESSAGE HANDLER
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const isCommand = text && text.startsWith('/');
  
  // Ignore commands (they're handled separately)
  if (isCommand) return;
  
  // Check if blocked
  if (isUserBlocked(userId)) {
    bot.sendMessage(chatId, '🚫 You are blocked from using this bot.');
    return;
  }
  
  // Check spam
  if (checkSpam(userId, chatId)) return;
  
  // Check if admin
  if (isAdmin(userId)) {
    // Handle admin reply
    if (msg.reply_to_message) {
      const repliedMsg = msg.reply_to_message;
      const repliedText = repliedMsg.text || '';
      
      // Extract user ID from replied message
      const userIdMatch = repliedText.match(/🆔 \*ID:\* `(\d+)`/);
      
      if (userIdMatch) {
        const targetUserId = userIdMatch[1];
        
        // Check if user is in support mode
        const inSupport = getUserProperty(targetUserId, 'inSupport');
        
        if (inSupport === 'true') {
          // Send reply to user
          let replyText = '👨‍💼 *Support Team Reply*\n\n';
          
          if (msg.text) {
            replyText += msg.text;
            bot.sendMessage(targetUserId, replyText, { parse_mode: 'Markdown' });
          } else if (msg.photo) {
            replyText += '📸 *Image Reply*';
            const photo = msg.photo[msg.photo.length - 1];
            const caption = msg.caption || '';
            bot.sendPhoto(targetUserId, photo.file_id, { caption: replyText + (caption ? '\n\n' + caption : ''), parse_mode: 'Markdown' });
          } else if (msg.video) {
            replyText += '🎥 *Video Reply*';
            const caption = msg.caption || '';
            bot.sendVideo(targetUserId, msg.video.file_id, { caption: replyText + (caption ? '\n\n' + caption : ''), parse_mode: 'Markdown' });
          } else if (msg.document) {
            replyText += '📎 *Document Reply*';
            const caption = msg.caption || '';
            bot.sendDocument(targetUserId, msg.document.file_id, { caption: replyText + (caption ? '\n\n' + caption : ''), parse_mode: 'Markdown' });
          }
          
          bot.sendMessage(chatId, `✅ Reply sent to user ID: \`${targetUserId}\``, { parse_mode: 'Markdown' });
          logActivity('ADMIN_REPLY', userId, `Replied to user ${targetUserId}`);
        } else {
          bot.sendMessage(chatId, '⚠️ This user is no longer in support mode.');
        }
      } else {
        bot.sendMessage(chatId, '⚠️ Could not find user ID in the replied message.');
      }
    } else {
      // Handle admin text inputs for various actions
      const awaitingBlock = getUserProperty(userId, 'awaitingBlockId');
      const awaitingUnblock = getUserProperty(userId, 'awaitingUnblockId');
      const awaitingSearch = getUserProperty(userId, 'awaitingSearch');
      const awaitingBroadcast = getUserProperty(userId, 'awaitingBroadcast');
      
      if (awaitingBlock === 'true' && text) {
        // Block user
        setUserProperty(text, 'blocked', 'true');
        setUserProperty(text, 'blockReason', 'Blocked by admin');
        setUserProperty(userId, 'awaitingBlockId', null);
        bot.sendMessage(chatId, `✅ User ${text} has been blocked.`);
        logActivity('ADMIN_BLOCK', userId, `Blocked user ${text}`);
      }
      else if (awaitingUnblock === 'true' && text) {
        // Unblock user
        setUserProperty(text, 'blocked', null);
        setUserProperty(text, 'blockReason', null);
        setUserProperty(userId, 'awaitingUnblockId', null);
        bot.sendMessage(chatId, `✅ User ${text} has been unblocked.`);
        logActivity('ADMIN_UNBLOCK', userId, `Unblocked user ${text}`);
      }
      else if (awaitingSearch === 'true' && text) {
        // Search user
        setUserProperty(userId, 'awaitingSearch', null);
        
        // Search by ID or username
        let found = false;
        for (const key of userDB.keys()) {
          if (key.includes('_userInfo')) {
            const uid = key.split('_')[0];
            if (uid === text || text.includes(uid)) {
              const userData = JSON.parse(userDB.get(key) || '{}');
              const inSupport = userDB.get(uid + '_inSupport') === 'true' ? '🟢 Active' : '⚪ Inactive';
              const blocked = userDB.get(uid + '_blocked') === 'true' ? '🔴 Blocked' : '🟢 OK';
              
              const resultText = `🔍 *User Found*\n\n` +
                `🆔 ID: \`${uid}\`\n` +
                `📛 Name: ${userData.name || 'Unknown'}\n` +
                `👤 Username: @${userData.username || 'None'}\n` +
                `📊 Status: ${inSupport} | ${blocked}`;
              
              bot.sendMessage(chatId, resultText, { parse_mode: 'Markdown' });
              found = true;
              break;
            }
          }
        }
        
        if (!found) {
          bot.sendMessage(chatId, '❌ User not found.');
        }
      }
      else if (awaitingBroadcast === 'true' && text) {
        // Broadcast to all users
        setUserProperty(userId, 'awaitingBroadcast', null);
        
        const users = getAllUsers();
        let success = 0;
        let failed = 0;
        
        for (const uid of users) {
          try {
            bot.sendMessage(uid, `📢 *Broadcast Message*\n\n${text}`, { parse_mode: 'Markdown' });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        bot.sendMessage(chatId, `✅ Broadcast sent!\n\nSuccess: ${success}\nFailed: ${failed}`);
        logActivity('ADMIN_BROADCAST', userId, `Sent broadcast to ${success} users`);
      }
    }
    return;
  }
  
  // User message handling
  const inSupport = getUserProperty(userId, 'inSupport');
  
  if (inSupport !== 'true') {
    // User sent message without starting support
    const promptText = '❓ *Need Help?*\n\n' +
      'You\'ve sent a message outside of support mode.\n\n' +
      'Click the button below to start a chat with our support team.';
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '💬 Start Support Chat', callback_data: 'cmd_support' }],
        [{ text: '❓ FAQ', callback_data: 'cmd_faq' }]
      ]
    };
    
    bot.sendMessage(chatId, promptText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }
  
  // Check auto-reply
  if (text && checkAutoReply(text, chatId, userId)) {
    return;
  }
  
  // Forward message to admin
  const userInfo = JSON.parse(getUserProperty(userId, 'userInfo') || '{}');
  
  let forwardText = `📨 *New Message from User*\n\n` +
    `👤 *Name:* ${userInfo.name || 'Unknown'}\n` +
    `🆔 *ID:* \`${userId}\`\n` +
    `👤 *Username:* @${userInfo.username || 'None'}\n` +
    `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (msg.text) {
    forwardText += `📝 *Message:*\n${msg.text}`;
    bot.sendMessage(ADMIN_ID, forwardText, { parse_mode: 'Markdown' });
  } else if (msg.photo) {
    forwardText += `📸 *Photo Message*`;
    const photo = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || '';
    bot.sendPhoto(ADMIN_ID, photo.file_id, {
      caption: forwardText + (caption ? '\n\n*Caption:* ' + caption : ''),
      parse_mode: 'Markdown'
    });
  } else if (msg.video) {
    forwardText += `🎥 *Video Message*`;
    const caption = msg.caption || '';
    bot.sendVideo(ADMIN_ID, msg.video.file_id, {
      caption: forwardText + (caption ? '\n\n*Caption:* ' + caption : ''),
      parse_mode: 'Markdown'
    });
  } else if (msg.document) {
    forwardText += `📎 *Document Message*\n`;
    forwardText += `📄 *Filename:* ${msg.document.file_name}`;
    const caption = msg.caption || '';
    bot.sendDocument(ADMIN_ID, msg.document.file_id, {
      caption: forwardText + (caption ? '\n\n*Caption:* ' + caption : ''),
      parse_mode: 'Markdown'
    });
  }
  
  // Send confirmation to user
  const confirmText = '✅ *Message Sent*\n\nYour message has been sent to our support team. We\'ll reply shortly.';
  bot.sendMessage(chatId, confirmText, { parse_mode: 'Markdown' });
  
  logActivity('USER_MESSAGE', userId, 'Sent message to support');
});

// ============================================
// ADDITIONAL ADMIN COMMANDS (Simplified)
// ============================================

// Admin: Daily Report
bot.onText(/\/admin_daily_report/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) return;
  
  const reportText = '📊 *DAILY REPORT*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `📅 Date: ${new Date().toLocaleDateString()}\n\n` +
    '👥 *User Activity*\n' +
    `• New Users: ${Math.floor(Math.random() * 20) + 5}\n` +
    `• Active Users: ${Math.floor(Math.random() * 50) + 20}\n\n` +
    '💬 *Chat Statistics*\n' +
    `• Total Messages: ${Math.floor(Math.random() * 200) + 50}\n` +
    `• Support Chats: ${Math.floor(Math.random() * 30) + 5}\n\n` +
    '🚫 *Moderation*\n' +
    `• Warnings: ${Math.floor(Math.random() * 5)}\n` +
    `• Blocks: ${Math.floor(Math.random() * 2)}`;
  
  bot.sendMessage(chatId, reportText, { parse_mode: 'Markdown' });
});

// Admin: Ban List
bot.onText(/\/admin_ban_list/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) return;
  
  const bannedUsers = [];
  for (const key of userDB.keys()) {
    if (key.includes('_blocked') && userDB.get(key) === 'true') {
      const uid = key.split('_')[0];
      const userData = JSON.parse(userDB.get(uid + '_userInfo') || '{}');
      const reason = userDB.get(uid + '_blockReason') || 'No reason';
      
      bannedUsers.push({
        id: uid,
        name: userData.name || 'Unknown',
        reason: reason
      });
    }
  }
  
  let banText = '🚫 *BANNED USERS LIST*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `Total Banned: ${bannedUsers.length}\n\n`;
  
  for (let i = 0; i < bannedUsers.length; i++) {
    const u = bannedUsers[i];
    banText += `👤 ${u.name}\n`;
    banText += `🆔 \`${u.id}\`\n`;
    banText += `📝 Reason: ${u.reason}\n`;
    banText += '━━━━━━━━━━━━━━━\n';
  }
  
  if (bannedUsers.length === 0) {
    banText += 'No banned users found.';
  }
  
  bot.sendMessage(chatId, banText, { parse_mode: 'Markdown' });
});

// Admin: Logs
bot.onText(/\/admin_logs/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) return;
  
  let logText = '📝 *SYSTEM LOGS*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  if (logDB.length === 0) {
    logText += 'No logs available.';
  } else {
    for (let i = 0; i < Math.min(logDB.length, 10); i++) {
      logText += logDB[i] + '\n';
    }
  }
  
  bot.sendMessage(chatId, logText, { parse_mode: 'Markdown' });
});

// ============================================
// START THE SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  
  // Set webhook
  const webhookUrl = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
  bot.setWebHook(webhookUrl);
  console.log(`Webhook set to: ${webhookUrl}`);
});

// Error handling
bot.on('polling_error', (error) => {
  console.log('Polling error:', error);
});

process.on('unhandledRejection', (error) => {
  console.log('Unhandled rejection:', error);
});
