import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { MEMBERS, CATEGORIES, solveMatching, allocate } from '../public/shared.mjs';

const order = n => Array.from({ length: n }, (_, i) => i);
function bruteForce(weights, person = 0, used = new Set()) {
  if (person === weights.length) return 0;
  let best = -Infinity;
  for (let category = 0; category < weights[person].length; category++) {
    if (used.has(category)) continue;
    used.add(category);
    best = Math.max(best, weights[person][category] + bruteForce(weights, person + 1, used));
    used.delete(category);
  }
  return best;
}
test('matching avoids greedy choices and agrees with exhaustive search', () => {
  const counterexample = [[9, 8, 0], [8, 0, 0]];
  assert.equal(solveMatching(counterexample, [0, 1], [0, 1, 2]).score, 16);
  for (let seed = 0; seed < 40; seed++) {
    const weights = order(4).map(person => order(6).map(category => (seed * (person + 3) + category * 7 + person * category) % 10));
    const result = solveMatching(weights, [2, 0, 3, 1], [4, 0, 3, 2, 5, 1]);
    assert.equal(result.score, bruteForce(weights));
    assert.equal(new Set(result.pairs.map(pair => pair.category)).size, 4);
  }
});
test('concentrated votes still give all eight people distinct awards, excluding Ender', () => {
  const ballots = Object.fromEntries(order(9).map(i => [i, Array(14).fill(0)]));
  const awards = allocate(ballots, order(8), order(14));
  assert.equal(awards.length, 8);
  assert.deepEqual(awards.map(award => award.person).sort(), order(8));
  assert.equal(new Set(awards.map(award => award.category)).size, 8);
  assert.ok(awards.every(award => MEMBERS[award.person] !== 'Ender'));
  assert.deepEqual(allocate(ballots, order(8), order(14)), awards);
});
test('zero-score ties are complete and deterministic with preserved orders', () => {
  const first = allocate({}, [6, 3, 5, 1, 2, 0, 7, 4], order(14).reverse());
  assert.equal(first.length, 8);
  assert.deepEqual(allocate({}, [6, 3, 5, 1, 2, 0, 7, 4], order(14).reverse()), first);
  assert.throws(() => solveMatching([[1], [2]], [0, 1], [0]), /at least/);
});

async function running(t, options) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(path, secret, data) {
    const response = await fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: response.status, body: await response.json() };
  }
  return { server, base, api };
}
test('live ceremony: private ballots, revisions, locking, reveals and restart recovery', async t => {
  const { api, base } = await running(t);
  const { body: host, status } = await api('/api/rooms', null, {});
  assert.equal(status, 201);
  const path = action => `/api/rooms/${host.id}/${action}`;
  let hostState = (await api(path('state'), host.token)).body;
  const voters = hostState.backup.voterTokens;
  assert.equal((await api(path('state'), 'incorrect')).status, 403);
  assert.equal((await api(path('advance'), voters[0], { expectedStage: 0 })).status, 403);
  assert.equal((await api(path('ballot'), voters[0], { ballot: Array(14).fill(0) })).status, 409);

  const controller = new AbortController();
  t.after(() => controller.abort());
  const live = await fetch(`${base}${path('events')}?token=${voters[0]}`, { signal: controller.signal });
  assert.match(live.headers.get('content-type'), /event-stream/);
  const reader = live.body.getReader();
  let buffer = '';
  async function nextState() {
    while (true) {
      const boundary = buffer.indexOf('\n\n');
      if (boundary >= 0) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (message.startsWith('data: ')) return JSON.parse(message.slice(6));
      } else {
        const item = await reader.read();
        assert.equal(item.done, false);
        buffer += new TextDecoder().decode(item.value);
      }
    }
  }
  const initial = await nextState();
  assert.equal(initial.host, false);
  assert.equal(initial.backup, undefined);
  assert.equal(initial.ballots, undefined);
  assert.equal(initial.submittedVoters, undefined);
  assert.equal(initial.voter, 0);
  await api(path('advance'), host.token, { expectedStage: 0 });
  assert.equal((await nextState()).stage, 1);
  await api(path('advance'), host.token, { expectedStage: 1 });
  assert.equal((await nextState()).stage, 2);
  await reader.cancel();
  controller.abort();

  assert.equal((await api(path('advance'), host.token, { expectedStage: 1 })).status, 409);
  assert.equal((await api(path('advance'), host.token, { expectedStage: 2, confirmIncomplete: true })).status, 409);
  assert.equal((await api(path('ballot'), host.token, { ballot: Array(14).fill(0) })).status, 403);
  for (const ballot of [[], Array(14).fill(8), Array(14).fill(-1), Array(14).fill('0'), Array(14).fill(0.1)]) {
    assert.equal((await api(path('ballot'), voters[0], { ballot })).status, 400);
  }
  assert.equal((await api(path('ballot'), voters[0], null)).status, 400);
  // Self-voting is allowed; replacing the ballot must not increase turnout.
  assert.equal((await api(path('ballot'), voters[0], { ballot: Array(14).fill(0) })).status, 200);
  const revised = order(14).map(i => i % 8);
  assert.equal((await api(path('ballot'), voters[0], { ballot: revised })).body.submitted, 1);
  assert.deepEqual((await api(path('state'), voters[0])).body.ballot, revised);
  assert.equal((await api(path('state'), voters[1])).body.ballot, null);
  assert.equal((await api(path('advance'), host.token, { expectedStage: 2 })).status, 409);
  for (let i = 1; i < 9; i++) {
    assert.equal((await api(path('ballot'), voters[i], { ballot: order(14).map(c => (c + i) % 8) })).status, 200);
  }
  hostState = (await api(path('advance'), host.token, { expectedStage: 2 })).body;
  assert.equal(hostState.stage, 3);
  assert.equal(hostState.submitted, 9);
  assert.deepEqual(hostState.awards, []);
  assert.equal((await api(path('ballot'), voters[0], { ballot: revised })).status, 409);
  assert.equal((await api(path('advance'), host.token, { expectedStage: 3 })).status, 409);
  assert.equal((await api(path('reveal'), voters[0], { expectedRevealed: 0 })).status, 403);
  for (let i = 0; i < 8; i++) {
    hostState = (await api(path('reveal'), host.token, { expectedRevealed: i })).body;
    assert.equal(hostState.awards.length, i + 1);
  }
  assert.equal((await api(path('reveal'), host.token, { expectedRevealed: 7 })).status, 409);
  assert.equal(new Set(hostState.awards.map(a => a.person)).size, MEMBERS.length);
  assert.equal(new Set(hostState.awards.map(a => a.category)).size, MEMBERS.length);
  assert.ok(hostState.awards.every(a => a.category < CATEGORIES.length));
  const final = (await api(path('advance'), host.token, { expectedStage: 3 })).body;
  assert.equal(final.stage, 4);
  assert.deepEqual(final.awards, hostState.awards);

  const backup = final.backup;
  const { api: fresh } = await running(t);
  assert.equal((await fresh(path('state'), host.token)).status, 404);
  assert.equal((await fresh('/api/restore', voters[0], backup)).status, 403);
  assert.equal((await fresh('/api/restore', host.token, { ...backup, ballots: { 0: [8] } })).status, 400);
  assert.equal((await fresh('/api/restore', host.token, { ...backup, categoryOrder: Array(14).fill(0) })).status, 400);
  assert.equal((await fresh('/api/restore', host.token, { ...backup, createdAt: Date.now() - 13 * 3600000 })).status, 400);
  assert.equal((await fresh('/api/restore', host.token, backup)).status, 201);
  assert.equal((await fresh('/api/restore', host.token, backup)).status, 409);
  const recovered = (await fresh(path('state'), voters[8])).body;
  assert.deepEqual(recovered.awards, final.awards);
  assert.equal(recovered.stage, 4);
  assert.equal(recovered.voter, 8);
  assert.equal(recovered.backup, undefined);
});
test('a confirmed partial turnout can still produce eight unique awards', async t => {
  const { api } = await running(t);
  const { body: host } = await api('/api/rooms', null, {});
  const path = action => `/api/rooms/${host.id}/${action}`;
  const state = (await api(path('state'), host.token)).body;
  await api(path('advance'), host.token, { expectedStage: 0 });
  await api(path('advance'), host.token, { expectedStage: 1 });
  await api(path('ballot'), state.backup.voterTokens[8], { ballot: Array(14).fill(0) });
  const closed = await api(path('advance'), host.token, { expectedStage: 2, confirmIncomplete: true });
  assert.equal(closed.status, 200);
  for (let i = 0; i < 8; i++) {
    const revealed = await api(path('reveal'), host.token, { expectedRevealed: i });
    assert.equal(revealed.body.awards.length, i + 1);
  }
});
test('GitHub Pages origin can create, authenticate and stream through the separate relay', async t => {
  const origin = 'https://enderyuksel.github.io';
  const { base } = await running(t, { allowedOrigin: origin });
  const preflight = await fetch(`${base}/api/rooms`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(preflight.headers.get('vary'), 'Origin');
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const room = await response.json();
  const state = await fetch(`${base}/api/rooms/${room.id}/state`, {
    headers: { Origin: origin, Authorization: `Bearer ${room.token}` }
  });
  assert.equal(state.status, 200);
  assert.equal(state.headers.get('access-control-allow-origin'), origin);
  const { backup } = await state.json();
  const events = await fetch(`${base}/api/rooms/${room.id}/events?token=${backup.voterTokens[0]}`, {
    headers: { Origin: origin }
  });
  assert.equal(events.headers.get('access-control-allow-origin'), origin);
  assert.match(events.headers.get('content-type'), /event-stream/);
  const reader = events.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /"voter":0/);
  await reader.cancel();
});
test('relay rejects other origins and invalid origin configuration without weakening local access', async t => {
  const { base } = await running(t, { allowedOrigin: 'https://enderyuksel.github.io' });
  for (const origin of ['https://unrelated.example', 'null', 'not a URL']) {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const response = await fetch(`${base}/api/health`, { method, headers: { Origin: origin } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
  }
  const local = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(local.status, 201);
  const config = await fetch(`${base}/config.mjs`);
  assert.equal(config.status, 200);
  assert.match(config.headers.get('content-type'), /javascript/);
  assert.throws(() => createApp({ allowedOrigin: 'https://enderyuksel.github.io/hygge3/' }), /without a path/);
});
