import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../src/db.ts';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { io: connect } = require('socket.io-client');

function waitForState(socket, predicate, action) {
  return new Promise((resolve, reject) => {
    if (!action && socket.lastRoomState && predicate(socket.lastRoomState)) {
      resolve(socket.lastRoomState);
      return;
    }
    const timeout = setTimeout(() => {
      socket.off('update_room_state', onState);
      reject(new Error('Timed out waiting for room state'));
    }, 5000);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off('update_room_state', onState);
      resolve(state);
    }
    socket.on('update_room_state', onState);
    action?.();
  });
}

test('game state, countdown, dynamic rules, scoring, podium and restart', async () => {
  process.env.PORT = '0';
  const usernames = { 1: 'Ana', 2: 'Beto', 3: 'Caro', 4: 'Dani' };
  let challengeNumber = 0;
  let failNextChallenge = false;
  const users = new Map();
  const memberships = new Set();
  let session;
  pool.connect = async () => ({
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('INSERT INTO users')) {
        if (!users.has(params[0])) users.set(params[0], String(users.size + 1));
        return { rows: [{ id: users.get(params[0]) }] };
      }
      if (sql.includes('INSERT INTO game_sessions')) {
        session = { id: '1', code: params[0], status: 'waiting' };
        return { rows: [session] };
      }
      if (sql.includes('FROM game_sessions')) {
        return { rows: session?.code === params[0] ? [session] : [] };
      }
      if (sql.includes('SELECT id FROM session_players')) {
        return { rows: memberships.has(params[1]) ? [{ id: '1' }] : [] };
      }
      if (sql.includes('INSERT INTO session_players')) {
        memberships.add(params[1]);
        return { rows: [] };
      }
      throw new Error(`Unexpected client query: ${sql}`);
    },
    release() {}
  });
  pool.query = async (sql, params) => {
    if (sql.includes('FROM game_sessions s')) {
      const username = usernames[params[1]];
      return { rows: username ? [{ username, host_user_id: '1' }] : [] };
    }
    if (sql.includes('FROM challenges')) {
      if (failNextChallenge) {
        failNextChallenge = false;
        throw new Error('Simulated database outage');
      }
      challengeNumber++;
      const duration_type = challengeNumber === 1 ? 'seconds' : challengeNumber === 2 ? 'rounds' : 'normal';
      return { rows: [{ id: challengeNumber, content: 'Reto', category: 'Reto', intensity_level: 1,
        duration_type, duration_value: duration_type === 'seconds' ? 1 : duration_type === 'rounds' ? 2 : 0 }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const { server, io } = await import('../src/index.ts');
  if (!server.listening) await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const guestTokens = new Map();
  let roomCode;
  async function join(userId) {
    const socket = connect(url, { reconnection: false });
    clients.push(socket);
    socket.on('update_room_state', state => { socket.lastRoomState = state; });
    await once(socket, 'connect');
    const state = waitForState(socket, s => s.players.some(p => p.id === userId && p.connected), () => {
      socket.emit('join_room', { roomCode, userId, guestToken: guestTokens.get(userId) }, result => {
        assert.equal(result.error, undefined);
      });
    });
    await state;
    return socket;
  }
  try {
    const createResponse = await fetch(`${url}/api/games/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Ana' })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    roomCode = created.session.code;
    guestTokens.set(created.userId, created.guestToken);
    const joinIds = [];
    for (const username of ['Beto', 'Caro', 'Dani']) {
      const response = await fetch(`${url}/api/games/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: created.session.code, username })
      });
      assert.equal(response.status, 200);
      const joined = await response.json();
      joinIds.push(joined.userId);
      guestTokens.set(joined.userId, joined.guestToken);
    }
    assert.equal(new Set([created.userId, ...joinIds]).size, 4);
    const duplicateName = await fetch(`${url}/api/games/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, username: 'Beto' })
    });
    assert.equal(duplicateName.status, 409);
    const rejoin = await fetch(`${url}/api/games/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, username: 'Beto', guestToken: guestTokens.get('2') })
    });
    assert.equal(rejoin.status, 200);
    assert.equal((await rejoin.json()).userId, '2');

    let guest = await join('2');
    assert.equal(guest.lastRoomState.hostId, '');
    const impersonation = await new Promise(resolve => {
      guest.emit('join_room', { roomCode, userId: '1', guestToken: guestTokens.get('2') }, resolve);
    });
    assert.ok(impersonation.error);
    const host = await join('1');
    let state = await waitForState(host, s => s.challenge?.id === 1);
    assert.equal(state.hostId, host.id);
    assert.equal(state.hostPlayerId, '1');
    const forbiddenTransfer = once(guest, 'game_error');
    guest.emit('transfer_host', { roomCode, playerId: '2' });
    await forbiddenTransfer;
    state = await waitForState(host, s => s.hostPlayerId === '2', () => {
      host.emit('transfer_host', { roomCode, playerId: '2' });
    });
    assert.equal(state.hostId, guest.id);
    const oldHostForbidden = once(host, 'game_error');
    host.emit('finish_game', roomCode);
    await oldHostForbidden;
    await waitForState(host, s => s.hostPlayerId === '1', () => {
      guest.emit('transfer_host', { roomCode, playerId: '1' });
    });
    await delay(1200);
    assert.equal(host.lastRoomState.timerStatus, 'idle');
    const forbidden = once(guest, 'game_error');
    guest.emit('start_timer', roomCode);
    await forbidden;
    state = await waitForState(host, s => s.timerStatus === 'running', () => host.emit('start_timer', roomCode));
    assert.equal(state.timeLeft, 1);
    state = await waitForState(guest, s => s.timerStatus === 'finished');
    assert.equal(state.timeLeft, 0);

    const firstTurn = state.turnId;
    const assigned = state.assignedPlayerId;
    state = await waitForState(host, s => s.challenge?.id === 2, () => {
      host.emit('complete_challenge', { roomCode, turnId: firstTurn });
    });
    assert.equal(state.players.find(p => p.id === assigned).score, 1);
    assert.equal(state.rules[0].remainingRounds, 2);
    const duplicate = once(host, 'game_error');
    host.emit('complete_challenge', { roomCode, turnId: firstTurn });
    await duplicate;

    async function skip() {
      const previous = state.turnId;
      state = await waitForState(host, s => s.turnId !== previous, () => {
        host.emit('request_challenge', { roomCode, turnId: previous });
      });
    }
    await skip();
    assert.equal(state.rules[0].remainingRounds, 2);
    await skip();
    assert.equal(state.rules[0].remainingRounds, 2);
    await skip();
    assert.equal(state.rules[0].remainingRounds, 1);
    const third = await join('3');
    await skip();
    await skip();
    assert.equal(state.rules[0].remainingRounds, 1);
    await skip();
    assert.equal(state.rules.length, 0);
    assert.equal(state.players.reduce((sum, p) => sum + p.score, 0), 1);
    failNextChallenge = true;
    const failed = once(host, 'game_error');
    host.emit('complete_challenge', { roomCode, turnId: state.turnId });
    await failed;
    assert.equal(host.lastRoomState.players.reduce((sum, p) => sum + p.score, 0), 2);
    const repeated = once(host, 'game_error');
    host.emit('complete_challenge', { roomCode, turnId: state.turnId });
    await repeated;
    await skip();
    assert.equal(state.players.reduce((sum, p) => sum + p.score, 0), 2);

    const guestScore = state.players.find(p => p.id === '2').score;
    await waitForState(host, s => !s.players.find(p => p.id === '2').connected, () => guest.disconnect());
    guest = await join('2');
    assert.equal(guest.lastRoomState.players.find(p => p.id === '2').score, guestScore);

    state = await waitForState(host, s => s.status === 'finished', () => host.emit('finish_game', roomCode));
    assert.equal(state.challenge, null);
    const late = await join('4');
    const lateState = await waitForState(late, s => s.status === 'finished', () => {
      late.emit('join_room', { roomCode, userId: '4', guestToken: guestTokens.get('4') }, () => {});
    });
    assert.equal(lateState.challenge, null);
    state = await waitForState(host, s => s.status === 'playing', () => host.emit('start_game', roomCode));
    assert.ok(state.challenge);
    assert.ok(state.players.every(player => player.score === 0));
    assert.equal(state.rules.length, 0);
    const transfer = waitForState(guest, s => s.hostId === guest.id, () => host.emit('leave_room', roomCode));
    await transfer;
    const secondTransfer = waitForState(third, s => s.hostId === third.id, () => guest.disconnect());
    await secondTransfer;
    const unauthorized = await new Promise(resolve => {
      host.emit('join_room', { roomCode, userId: '1', guestToken: guestTokens.get('1') }, resolve);
    });
    assert.ok(unauthorized.error);
    const returnAfterLeaving = await fetch(`${url}/api/games/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, username: 'Ana' })
    });
    assert.equal(returnAfterLeaving.status, 200);
    assert.notEqual((await returnAfterLeaving.json()).guestToken, guestTokens.get('1'));
  } finally {
    for (const client of clients) client.disconnect();
    await new Promise(resolve => io.close(resolve));
    await pool.end();
  }
});
