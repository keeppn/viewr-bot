// Зареждай .env само локално (в Railway няма .env)
if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}

const express = require('express');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const app = express();
app.use(express.json());

// ===== ENV DIAGNOSTICS (не печата стойности) =====
const keys = ['DISCORD_TOKEN', 'SHARED_SECRET', 'PORT', 'RAILWAY_ENVIRONMENT'];
console.log('[ENV CHECK]', keys.map(k => `${k}:${process.env[k] ? 'set' : 'missing'}`).join(' | '));

// Discord client с нужните intent-и
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // нужно за members.fetch() и roles.add()
  ],
});

// Ready (v14)
client.on(Events.ClientReady, () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);
});

// Проста защита за HTTP endpoint-ите
const SHARED = process.env.SHARED_SECRET;
function checkAuth(req, res, next) {
  const token = req.header('X-Auth-Token');
  if (!token || !SHARED || token !== SHARED) return res.status(403).send('Forbidden');
  next();
}

// Health
app.get('/health', (_, res) => res.status(200).send('OK'));

// (по желание) Диагностичен endpoint – махни го след като всичко тръгне
app.get('/_env', checkAuth, (req, res) => {
  res.json({
    DISCORD_TOKEN: !!process.env.DISCORD_TOKEN,
    SHARED_SECRET: !!process.env.SHARED_SECRET,
    PORT: process.env.PORT || null,
    RAILWAY_ENVIRONMENT: !!process.env.RAILWAY_ENVIRONMENT
  });
});

// POST /assign-role  body: { guildId, userId, roleName }
app.post('/assign-role', checkAuth, async (req, res) => {
  try {
    const { guildId, userId, roleName } = req.body || {};
    if (!guildId || !userId || !roleName) {
      return res.status(400).send('Missing guildId/userId/roleName');
    }

    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({ name: roleName });
    }

    await member.roles.add(role);
    try { await member.send(`✅ Одобрен си за co-stream. Роля: ${role.name}`); } catch {}
    res.status(200).send('Role assigned');
  } catch (err) {
    console.error('[ASSIGN-ROLE ERROR]', err);
    res.status(500).send('Error');
  }
});

// Стартираме HTTP
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[HTTP] Listening on :${port}`));

// Discord login (чете от process.env; в Railway идва от Variables)
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('[ERROR] Missing DISCORD_TOKEN env var');
  process.exit(1);
}
client.login(TOKEN).catch(e => console.error('[DISCORD LOGIN ERROR]', e));
