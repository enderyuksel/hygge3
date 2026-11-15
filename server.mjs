import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MEMBERS, VOTERS, CATEGORIES, STAGES, allocate } from './public/shared.mjs';

const TTL = 12 * 60 * 60 * 1000;
const token = () => randomBytes(24).toString('hex');
const shuffled = n => {
  const list = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};
const isToken = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const isId = value => typeof value === 'string' && /^[A-F0-9]{8}$/.test(value);
const validBallot = value => Array.isArray(value) && value.length === CATEGORIES.length &&
  value.every(person => Number.isInteger(person) && person >= 0 && person < MEMBERS.length);
const permutation = (value, n) => Array.isArray(value) && value.length === n &&
  new Set(value).size === n && value.every(i => Number.isInteger(i) && i >= 0 && i < n);
const fail = (status, message) => Object.assign(new Error(message), { status });

function restoreSnapshot(data) {
  if (!data || data.version !== 1 || !isId(data.id) || !isToken(data.hostToken) ||
    !Array.isArray(data.voterTokens) || data.voterTokens.length !== VOTERS.length ||
    !data.voterTokens.every(isToken) || new Set([...data.voterTokens, data.hostToken]).size !== 10 ||
    !permutation(data.personOrder, MEMBERS.length) || !permutation(data.categoryOrder, CATEGORIES.length) ||
    !Number.isSafeInteger(data.revision) || data.revision < 0 ||
    !Number.isInteger(data.stage) || data.stage < 0 || data.stage >= STAGES.length ||
    !Number.isInteger(data.revealed) || data.revealed < 0 || data.revealed > MEMBERS.length ||
    !Number.isFinite(data.createdAt) || data.createdAt > Date.now() || Date.now() - data.createdAt >= TTL ||
    !Number.isFinite(data.stageStartedAt) || data.stageStartedAt < data.createdAt || data.stageStartedAt > Date.now() ||
    !data.ballots || typeof data.ballots !== 'object' || Array.isArray(data.ballots) ||
    !Object.entries(data.ballots).every(([key, value]) => /^[0-8]$/.test(key) && validBallot(value)) ||
    (data.stage < 3 && data.revealed !== 0) ||
    (data.stage >= 3 && Object.keys(data.ballots).length === 0)) {
    throw fail(400, 'This recovery backup is invalid or older than 12 hours.');
  }
  const { id, hostToken, voterTokens, personOrder, categoryOrder, stage, revealed, createdAt, stageStartedAt, ballots, revision } = data;
  return { version: 1, id, hostToken, voterTokens, personOrder, categoryOrder, stage, revealed, createdAt, stageStartedAt, ballots, revision };
}

export function createApp({ allowedOrigin = process.env.ALLOWED_ORIGIN ?? '' } = {}) {
  if (allowedOrigin && (new URL(allowedOrigin).origin !== allowedOrigin ||
    !['https:', 'http:'].includes(new URL(allowedOrigin).protocol))) {
    throw new Error('ALLOWED_ORIGIN must be a website origin, without a path or trailing slash.');
  }
  const rooms = new Map();
  const streams = new Map();
  function identity(room, secret) {
    if (secret === room.hostToken) return { host: true };
    const voter = room.voterTokens.indexOf(secret);
    if (voter >= 0) return { host: false, voter };
    throw fail(403, 'This invitation is not valid. Ask Ender for your personal link.');
  }
  function state(room, auth) {
    const result = {
      id: room.id, revision: room.revision, stage: room.stage, stageStartedAt: room.stageStartedAt,
      submitted: Object.keys(room.ballots).length,
      revealed: room.revealed, host: auth.host,
      awards: room.stage >= 3 ? allocate(room.ballots, room.personOrder, room.categoryOrder).slice(0, room.revealed) : []
    };
    if (auth.host) {
      result.backup = room;
      result.submittedVoters = Object.keys(room.ballots).map(Number);
    } else {
      result.voter = auth.voter;
      result.ballot = room.ballots[auth.voter] ?? null;
    }
    return result;
  }
  function broadcast(room) {
    for (const connection of streams.get(room.id) ?? []) {
      connection.res.write(`data: ${JSON.stringify(state(room, connection.auth))}\n\n`);
    }
  }
  function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 65536) throw fail(413, 'Request is too large.');
    }
    let data;
    try { data = JSON.parse(text); }
    catch { throw fail(400, 'Request must contain valid JSON.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Request must contain a JSON object.');
    return data;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) res.setHeader('Vary', 'Origin');
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); }
        catch { throw fail(403, 'Invalid request origin.'); }
        const sameHost = ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
        if (!sameHost && req.headers.origin !== allowedOrigin) {
          throw fail(403, 'This website is not allowed to access the relay. Check ALLOWED_ORIGIN.');
        }
        if (url.pathname.startsWith('/api/') && !sameHost) {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        }
      }
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600'
        });
        return res.end();
      }
      if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        if (rooms.size >= 100) throw fail(503, 'This server is full. Please try later.');
        let id;
        do { id = randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(id));
        const room = {
          version: 1, id, hostToken: token(), voterTokens: VOTERS.map(token), ballots: {},
          personOrder: shuffled(MEMBERS.length), categoryOrder: shuffled(CATEGORIES.length),
          stage: 0, revealed: 0, revision: 0, createdAt: Date.now(), stageStartedAt: Date.now()
        };
        rooms.set(id, room);
        return json(res, 201, { id, token: room.hostToken });
      }
      if (url.pathname === '/api/restore' && req.method === 'POST') {
        const data = await body(req);
        if (req.headers.authorization !== `Bearer ${data?.hostToken}`) throw fail(403, 'The host recovery key is required.');
        const room = restoreSnapshot(data);
        if (rooms.has(room.id)) throw fail(409, 'This session is already running. Reconnect instead of restoring.');
        if (rooms.size >= 100) throw fail(503, 'This server is full. Please try later.');
        rooms.set(room.id, room);
        return json(res, 201, { id: room.id, token: room.hostToken });
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/(state|events|ballot|advance|reveal)$/);
      if (match) {
        const room = rooms.get(match[1]);
        if (!room || Date.now() - room.createdAt >= TTL) throw fail(404, 'Session not found. Ender can restore the latest backup, or create a new session.');
        const secret = req.headers.authorization?.replace(/^Bearer /, '') ?? url.searchParams.get('token');
        const auth = identity(room, secret);
        const action = match[2];
        if (action === 'state' && req.method === 'GET') return json(res, 200, state(room, auth));
        if (action === 'events' && req.method === 'GET') {
          const connections = streams.get(room.id) ?? new Set();
          if (connections.size >= 60) throw fail(429, 'Too many open tabs. Close an unused celebration tab.');
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          const connection = { res, auth };
          connections.add(connection);
          streams.set(room.id, connections);
          res.write(`data: ${JSON.stringify(state(room, auth))}\n\n`);
          res.on('close', () => {
            connections.delete(connection);
            if (!connections.size) streams.delete(room.id);
          });
          return;
        }
        if (req.method !== 'POST') throw fail(405, 'Method not allowed.');
        const data = await body(req);
        if (action === 'ballot') {
          if (auth.host) throw fail(403, 'Use Ender’s personal voter invitation to vote.');
          if (room.stage !== 2) throw fail(409, 'Voting is not open.');
          if (!validBallot(data.ballot)) throw fail(400, 'Choose one team member for each of the 14 categories.');
          room.ballots[auth.voter] = data.ballot;
        } else {
          if (!auth.host) throw fail(403, 'Only Ender can operate the presentation.');
          if (action === 'advance') {
            if (data.expectedStage !== room.stage) throw fail(409, 'The stage has already changed. Please try again.');
            if (room.stage >= STAGES.length - 1) throw fail(409, 'You are already at the closing stage.');
            if (room.stage === 2) {
              const count = Object.keys(room.ballots).length;
              if (!count) throw fail(409, 'At least one completed ballot is required.');
              if (count < VOTERS.length && data.confirmIncomplete !== true) throw fail(409, 'Some ballots are missing. Confirm before closing voting.');
            }
            if (room.stage === 3 && room.revealed !== MEMBERS.length) throw fail(409, 'Reveal all eight awards before continuing.');
            room.stage++;
            room.stageStartedAt = Date.now();
          } else if (action === 'reveal') {
            if (room.stage !== 3 || room.revealed >= MEMBERS.length) throw fail(409, 'There are no awards to reveal now.');
            if (data.expectedRevealed !== room.revealed) throw fail(409, 'This award has already been revealed.');
            room.revealed++;
          } else {
            throw fail(405, 'Method not allowed.');
          }
        }
        room.revision++;
        broadcast(room);
        return json(res, 200, state(room, auth));
      }
      const files = { '/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'], '/shared.mjs': ['shared.mjs', 'text/javascript'], '/config.mjs': ['config.mjs', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [filename, type] = files[url.pathname];
        const content = await readFile(new URL(`./public/${filename}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        return res.end(content);
      }
      throw fail(404, 'Page not found.');
    } catch (error) {
      if (!error.status) console.error('Request failed:', error);
      if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : 'The server had a problem. Please retry.' });
      else res.end();
    }
  });
  const heartbeat = setInterval(() => {
    for (const [id, room] of rooms) {
      if (Date.now() - room.createdAt >= TTL) {
        for (const { res } of streams.get(id) ?? []) res.end();
        streams.delete(id);
        rooms.delete(id);
      }
    }
    for (const connections of streams.values()) for (const { res } of connections) res.write(': heartbeat\n\n');
  }, 20000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => {
    console.log(`Hygge is ready on port ${server.address().port}`);
  });
}
