// Berechtigungen als Bit-Flags. Wird von Server und Client gemeinsam genutzt.
const P = {
  ADMIN: 1 << 0,
  MANAGE_SERVER: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  KICK: 1 << 4,
  BAN: 1 << 5,
  MANAGE_MESSAGES: 1 << 6,
  MENTION_EVERYONE: 1 << 7,
  CREATE_INVITE: 1 << 8,
  SEND: 1 << 9,
  ATTACH: 1 << 10,
  REACT: 1 << 11,
  CONNECT: 1 << 12,
  SPEAK: 1 << 13,
  STREAM: 1 << 14,
  MANAGE_EMOJIS: 1 << 15,
  MUTE_MEMBERS: 1 << 16,
  MOVE_MEMBERS: 1 << 17,
  CHANGE_NICK: 1 << 18,
  MANAGE_NICKS: 1 << 19,
  CREATE_THREADS: 1 << 20,
  SOUNDBOARD: 1 << 21,
};

const ALL = Object.values(P).reduce((a, b) => a | b, 0);

const DEFAULT_PERMS =
  P.SEND | P.ATTACH | P.REACT | P.CONNECT | P.SPEAK | P.STREAM | P.CREATE_INVITE |
  P.MENTION_EVERYONE | P.CHANGE_NICK | P.CREATE_THREADS | P.SOUNDBOARD;

const LABELS = {
  ADMIN: ['Administrator', 'Alle Rechte, ignoriert alle Einschränkungen'],
  MANAGE_SERVER: ['Server verwalten', 'Name, Icon, Banner ändern'],
  MANAGE_CHANNELS: ['Kanäle verwalten', 'Kanäle & Kategorien erstellen/bearbeiten/löschen'],
  MANAGE_ROLES: ['Rollen verwalten', 'Rollen erstellen und vergeben'],
  KICK: ['Mitglieder kicken', ''],
  BAN: ['Mitglieder bannen', ''],
  MANAGE_MESSAGES: ['Nachrichten verwalten', 'Fremde Nachrichten löschen, anheften, in Ankündigungen schreiben'],
  MENTION_EVERYONE: ['@everyone erwähnen', ''],
  CREATE_INVITE: ['Einladungen erstellen', ''],
  SEND: ['Nachrichten senden', ''],
  ATTACH: ['Dateien anhängen', ''],
  REACT: ['Reaktionen hinzufügen', ''],
  CONNECT: ['Sprachkanälen beitreten', ''],
  SPEAK: ['Sprechen', ''],
  STREAM: ['Video & Bildschirm teilen', ''],
  MANAGE_EMOJIS: ['Emojis, Sounds verwalten', ''],
  MUTE_MEMBERS: ['Mitglieder stummschalten', 'Server-Mute in Sprachkanälen'],
  MOVE_MEMBERS: ['Mitglieder verschieben/trennen', ''],
  CHANGE_NICK: ['Nickname ändern', ''],
  MANAGE_NICKS: ['Nicknames verwalten', ''],
  CREATE_THREADS: ['Threads erstellen', ''],
  SOUNDBOARD: ['Soundboard benutzen', ''],
};

function memberPerms(server, uid) {
  if (!server) return 0;
  if (server.ownerId === uid) return ALL;
  const m = server.members[uid];
  if (!m) return 0;
  let p = 0;
  for (const r of server.roles) {
    if (r.id === server.id || m.roles.includes(r.id)) p |= r.perms;
  }
  return p & P.ADMIN ? ALL : p;
}

function has(server, uid, flag) {
  return (memberPerms(server, uid) & flag) === flag;
}

module.exports = { P, ALL, DEFAULT_PERMS, LABELS, memberPerms, has };
