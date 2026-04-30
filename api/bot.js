/**
 * Telegram Bot API for Hotmail Checker
 * Supports key management, ban/unban, and multiple commands
 */

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const input = req.body || {};
  const action = input.action || '';

  try {
    switch (action) {
      case 'handle_update':
        return await handleTelegramUpdate(input, res);
      case 'send_message':
        return await sendMessage(input, res);
      case 'generate_key':
        return await generateKey(input, res);
      case 'list_keys':
        return await listKeys(input, res);
      case 'delete_key':
        return await deleteKey(input, res);
      case 'ban_user':
        return await banUser(input, res);
      case 'unban_user':
        return await unbanUser(input, res);
      case 'get_stats':
        return await getStats(input, res);
      default:
        return res.json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    console.error('Bot API error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// In-memory storage (in production, use a database)
const DATABASE = {
  keys: new Map(),
  bannedUsers: new Set(),
  stats: {
    totalChecks: 0,
    totalHits: 0,
    activeKeys: 0
  }
};

const OWNER_ID = '5028065177';
const BOT_TOKEN = '8772848240:AAElUPRV3veb84o8X-VX-OIuGU7yxq74h3Q';

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM UPDATE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleTelegramUpdate(input, res) {
  const update = input.update;
  
  if (!update) {
    return res.json({ error: 'No update provided' });
  }

  const message = update.message || update.callback_query?.message;
  const callbackQuery = update.callback_query;
  
  if (!message) {
    return res.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';
  const command = text.split(' ')[0].toLowerCase();

  // Check if user is banned
  if (DATABASE.bannedUsers.has(String(userId)) && command !== '/start') {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ You are banned from using this bot.\nContact admin for support.');
    return res.json({ ok: true });
  }

  // Command routing
  try {
    if (callbackQuery) {
      await handleCallbackQuery(callbackQuery, chatId, userId);
    } else if (command === '/start') {
      await handleStart(chatId, userId);
    } else if (command === '/menu') {
      await handleMenu(chatId, userId);
    } else if (command === '/generate') {
      await handleGenerate(chatId, userId, text);
    } else if (command === '/keys') {
      await handleListKeys(chatId, userId);
    } else if (command === '/delete') {
      await handleDeleteKey(chatId, userId, text);
    } else if (command === '/ban') {
      await handleBan(chatId, userId, text);
    } else if (command === '/unban') {
      await handleUnban(chatId, userId, text);
    } else if (command === '/stats') {
      await handleStats(chatId, userId);
    } else if (command === '/help') {
      await handleHelp(chatId, userId);
    } else {
      await telegramSendMessage(BOT_TOKEN, chatId, '❓ Unknown command. Use /menu to see available commands.');
    }
  } catch (e) {
    console.error('Command error:', e);
    await telegramSendMessage(BOT_TOKEN, chatId, `❌ Error: ${e.message}`);
  }

  return res.json({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK QUERY HANDLER (Inline Buttons)
// ─────────────────────────────────────────────────────────────────────────────
async function handleCallbackQuery(callbackQuery, chatId, userId) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;

  if (data === 'close_menu') {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, 'Menu closed.');
  } else if (data === 'show_help') {
    await showHelpPanel(chatId, messageId);
  } else if (data === 'show_generate') {
    await showGeneratePanel(chatId, messageId);
  } else if (data === 'show_keys') {
    await showKeysPanel(chatId, messageId, userId);
  } else if (data.startsWith('delete_key:')) {
    const keyId = data.split(':')[1];
    await confirmDeleteKey(chatId, messageId, keyId, userId);
  } else if (data.startsWith('confirm_delete:')) {
    const keyId = data.split(':')[1];
    await executeDeleteKey(chatId, messageId, keyId, userId);
  } else if (data.startsWith('ban_user:')) {
    const targetId = data.split(':')[1];
    await executeBan(chatId, messageId, targetId, userId);
  } else if (data.startsWith('unban_user:')) {
    const targetId = data.split(':')[1];
    await executeUnban(chatId, messageId, targetId, userId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
async function handleStart(chatId, userId) {
  const welcomeText = `
👋 Welcome to Hotmail Checker Bot!

👤 Your ID: <code>${userId}</code>
${userId === parseInt(OWNER_ID) ? '⭐ You are the OWNER' : ''}

Use /menu to see all available commands.
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: '📋 Commands Menu', callback_data: 'show_help' }],
      [{ text: '🔑 Generate Key', callback_data: 'show_generate' }],
      [{ text: '📝 My Keys', callback_data: 'show_keys' }]
    ]
  };

  await telegramSendMessage(BOT_TOKEN, chatId, welcomeText, keyboard);
}

async function handleMenu(chatId, userId) {
  const menuText = `
📋 <b>Commands Menu</b>

<b>👤 User Commands:</b>
/start - Start the bot
/menu - Show this menu
/help - Help & info
/stats - Bot statistics

<b>🔑 Key Management:</b>
/generate <duration> - Generate new key (owner only)
  Example: /generate 24h, /generate 7d
/keys - List all keys (owner only)
/delete <key_id> - Delete a key (owner only)

<b>🚫 Moderation:</b>
/ban <user_id> - Ban a user (owner only)
/unban <user_id> - Unban a user (owner only)

Tap a button below for quick access:
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: 'ℹ️ Help', callback_data: 'show_help' }],
      [{ text: '🔑 Generate Key', callback_data: 'show_generate' }],
      [{ text: '📝 View Keys', callback_data: 'show_keys' }],
      [{ text: '❌ Close', callback_data: 'close_menu' }]
    ]
  };

  await telegramSendMessage(BOT_TOKEN, chatId, menuText, keyboard);
}

async function handleHelp(chatId, userId) {
  await showHelpPanel(chatId, null);
}

async function showHelpPanel(chatId, messageId) {
  const helpText = `
ℹ️ <b>Help & Information</b>

<b>How to use:</b>
1. Generate a key using /generate
2. Use the key to access the checker
3. Keys have expiration times

<b>Key Formats:</b>
• 1h - 1 hour
• 24h - 24 hours  
• 7d - 7 days
• 30d - 30 days

<b>Need support?</b>
Contact: @Yuki_channelll
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Back to Menu', callback_data: 'show_generate' }],
      [{ text: '❌ Close', callback_data: 'close_menu' }]
    ]
  };

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, helpText, keyboard);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, helpText, keyboard);
  }
}

async function handleGenerate(chatId, userId, text) {
  if (String(userId) !== OWNER_ID) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Only the owner can generate keys.');
    return;
  }

  const parts = text.split(' ');
  const duration = parts[1] || '24h';

  try {
    const key = await createKey(duration);
    const keyText = `
✅ <b>Key Generated Successfully!</b>

🔑 <code>${key.key}</code>

⏱ Duration: ${duration}
📅 Expires: ${new Date(key.expiresAt).toLocaleString()}

Share this key with users or use it yourself.
    `.trim();

    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 View All Keys', callback_data: 'show_keys' }],
        [{ text: '🗑 Delete This Key', callback_data: `delete_key:${key.id}` }]
      ]
    };

    await telegramSendMessage(BOT_TOKEN, chatId, keyText, keyboard);
  } catch (e) {
    await telegramSendMessage(BOT_TOKEN, chatId, `❌ Error: ${e.message}`);
  }
}

async function showGeneratePanel(chatId, messageId) {
  const genText = `
🔑 <b>Generate New Key</b>

Use command: <code>/generate <duration></code>

Examples:
• <code>/generate 1h</code> - 1 hour
• <code>/generate 24h</code> - 24 hours
• <code>/generate 7d</code> - 7 days
• <code>/generate 30d</code> - 30 days

Only owner can generate keys.
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: '1 Hour', callback_data: 'cmd:/generate 1h' }],
      [{ text: '24 Hours', callback_data: 'cmd:/generate 24h' }],
      [{ text: '7 Days', callback_data: 'cmd:/generate 7d' }],
      [{ text: '30 Days', callback_data: 'cmd:/generate 30d' }],
      [{ text: '🔙 Back', callback_data: 'show_help' }]
    ]
  };

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, genText, keyboard);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, genText, keyboard);
  }
}

async function handleListKeys(chatId, userId) {
  if (String(userId) !== OWNER_ID) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Only the owner can view all keys.');
    return;
  }

  await showKeysPanel(chatId, null, userId);
}

async function showKeysPanel(chatId, messageId, userId) {
  const keys = Array.from(DATABASE.keys.values());
  
  if (keys.length === 0) {
    const text = '📭 No keys generated yet.\n\nUse /generate to create a new key.';
    if (messageId) {
      await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
    } else {
      await telegramSendMessage(BOT_TOKEN, chatId, text);
    }
    return;
  }

  let keyText = `📝 <b>All Generated Keys</b>\n\n`;
  const keyboard = { inline_keyboard: [] };

  keys.slice(0, 10).forEach((key, index) => {
    const expires = new Date(key.expiresAt);
    const isExpired = expires < new Date();
    const status = isExpired ? '⛔ Expired' : '✅ Active';
    
    keyText += `<b>#${index + 1}</b> ${status}\n`;
    keyText += `Key: <code>${key.key}</code>\n`;
    keyText += `Expires: ${expires.toLocaleString()}\n\n`;

    if (!isExpired) {
      keyboard.inline_keyboard.push([
        { text: `🗑 Delete #${key.id}`, callback_data: `delete_key:${key.id}` }
      ]);
    }
  });

  if (keys.length > 10) {
    keyText += `\n... and ${keys.length - 10} more keys.`;
  }

  keyboard.inline_keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'close_menu' }]);

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, keyText, keyboard);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, keyText, keyboard);
  }
}

async function handleDeleteKey(chatId, userId, text) {
  if (String(userId) !== OWNER_ID) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Only the owner can delete keys.');
    return;
  }

  const parts = text.split(' ');
  const keyId = parts[1];

  if (!keyId) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Usage: /delete <key_id>\n\nUse /keys to see key IDs.');
    return;
  }

  await confirmDeleteKey(chatId, null, keyId, userId);
}

async function confirmDeleteKey(chatId, messageId, keyId, userId) {
  const key = DATABASE.keys.get(keyId);
  
  if (!key) {
    const text = `❌ Key #${keyId} not found.`;
    if (messageId) {
      await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
    } else {
      await telegramSendMessage(BOT_TOKEN, chatId, text);
    }
    return;
  }

  const confirmText = `
⚠️ <b>Confirm Delete</b>

Are you sure you want to delete this key?

Key: <code>${key.key}</code>
Expires: ${new Date(key.expiresAt).toLocaleString()}

This action cannot be undone.
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Yes, Delete', callback_data: `confirm_delete:${keyId}` }],
      [{ text: '❌ Cancel', callback_data: 'show_keys' }]
    ]
  };

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, confirmText, keyboard);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, confirmText, keyboard);
  }
}

async function executeDeleteKey(chatId, messageId, keyId, userId) {
  const deleted = DATABASE.keys.delete(keyId);
  
  const text = deleted 
    ? `✅ Key #${keyId} has been deleted successfully.`
    : `❌ Failed to delete key #${keyId}.`;

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, text);
  }
}

async function handleBan(chatId, userId, text) {
  if (String(userId) !== OWNER_ID) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Only the owner can ban users.');
    return;
  }

  const parts = text.split(' ');
  const targetId = parts[1];

  if (!targetId) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Usage: /ban <user_id>');
    return;
  }

  await executeBan(chatId, null, targetId, userId);
}

async function executeBan(chatId, messageId, targetId, userId) {
  if (String(targetId) === OWNER_ID) {
    const text = '❌ Cannot ban the owner!';
    if (messageId) {
      await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
    } else {
      await telegramSendMessage(BOT_TOKEN, chatId, text);
    }
    return;
  }

  DATABASE.bannedUsers.add(String(targetId));
  
  const text = `✅ User <code>${targetId}</code> has been banned.\n\nThey will no longer be able to use the bot.`;
  
  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, text);
  }

  // Notify the banned user
  await telegramSendMessage(BOT_TOKEN, targetId, '🚫 You have been banned from using this bot.\n\nContact admin for support.');
}

async function handleUnban(chatId, userId, text) {
  if (String(userId) !== OWNER_ID) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Only the owner can unban users.');
    return;
  }

  const parts = text.split(' ');
  const targetId = parts[1];

  if (!targetId) {
    await telegramSendMessage(BOT_TOKEN, chatId, '❌ Usage: /unban <user_id>');
    return;
  }

  await executeUnban(chatId, null, targetId, userId);
}

async function executeUnban(chatId, messageId, targetId, userId) {
  const wasBanned = DATABASE.bannedUsers.delete(String(targetId));
  
  const text = wasBanned 
    ? `✅ User <code>${targetId}</code> has been unbanned.`
    : `ℹ️ User <code>${targetId}</code> was not banned.`;

  if (messageId) {
    await telegramEditMessageText(BOT_TOKEN, chatId, messageId, text);
  } else {
    await telegramSendMessage(BOT_TOKEN, chatId, text);
  }
}

async function handleStats(chatId, userId) {
  const totalKeys = DATABASE.keys.size;
  const activeKeys = Array.from(DATABASE.keys.values())
    .filter(k => new Date(k.expiresAt) > new Date()).length;
  const bannedCount = DATABASE.bannedUsers.size;

  const statsText = `
📊 <b>Bot Statistics</b>

🔑 Total Keys: ${totalKeys}
✅ Active Keys: ${activeKeys}
⛔ Expired Keys: ${totalKeys - activeKeys}

🚫 Banned Users: ${bannedCount}

📈 Checks Performed: ${DATABASE.stats.totalChecks}
🎯 Total Hits: ${DATABASE.stats.totalHits}
  `.trim();

  await telegramSendMessage(BOT_TOKEN, chatId, statsText);
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
async function createKey(duration) {
  const keyId = Math.random().toString(36).substring(2, 10);
  const key = `KEY-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  
  const now = new Date();
  const expiresAt = parseDuration(duration, now);

  const keyData = {
    id: keyId,
    key: key,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    duration: duration
  };

  DATABASE.keys.set(keyId, keyData);
  DATABASE.stats.activeKeys++;

  return keyData;
}

function parseDuration(duration, fromDate) {
  const match = duration.match(/^(\d+)(h|d|m)$/i);
  if (!match) {
    throw new Error('Invalid duration format. Use: 1h, 24h, 7d, 30d');
  }

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const result = new Date(fromDate);
  
  switch (unit) {
    case 'h':
      result.setHours(result.getHours() + value);
      break;
    case 'd':
      result.setDate(result.getDate() + value);
      break;
    case 'm':
      result.setMonth(result.getMonth() + value);
      break;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function telegramSendMessage(token, chatId, text, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };

    if (replyMarkup) {
      body.reply_markup = JSON.stringify(replyMarkup);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Telegram send error:', e);
    return { error: e.message };
  }
}

async function telegramEditMessageText(token, chatId, messageId, text, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const body = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML'
    };

    if (replyMarkup) {
      body.reply_markup = JSON.stringify(replyMarkup);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Telegram edit error:', e);
    return { error: e.message };
  }
}

async function sendMessage(input, res) {
  const { token, chatId, text } = input;
  const result = await telegramSendMessage(token, chatId, text);
  return res.json(result);
}

async function getStats(input, res) {
  return res.json({
    totalKeys: DATABASE.keys.size,
    activeKeys: Array.from(DATABASE.keys.values())
      .filter(k => new Date(k.expiresAt) > new Date()).length,
    bannedUsers: DATABASE.bannedUsers.size,
    stats: DATABASE.stats
  });
}
