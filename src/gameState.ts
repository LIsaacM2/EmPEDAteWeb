import { randomUUID } from 'node:crypto';

export interface Player {
  id: string;
  username: string;
  socketId: string | null;
  score: number;
}

export interface Challenge {
  id: string | number;
  content: string;
  category: string;
  intensity_level: number;
  duration_type: 'normal' | 'seconds' | 'rounds';
  duration_value: number;
}

export interface ActiveRule {
  id: string;
  challengeContent: string;
  targetUsername: string;
  remainingRounds: number;
  questionsInRound: number;
  skipCurrent: boolean;
}

export interface RoomState {
  players: Player[];
  hostId: string;
  hostPlayerId: string | null;
  status: 'playing' | 'finished';
  challenge: Challenge | null;
  challengeCompleted: boolean;
  turnId: string | null;
  assignedPlayerId: string | null;
  rules: ActiveRule[];
  timerEndsAt: number | null;
  timerStatus: 'idle' | 'running' | 'finished';
  advancing: boolean;
}

export function advanceRules(room: RoomState): void {
  const participants = room.players.filter(player => player.socketId !== null).length;
  if (participants === 0) return;

  for (const rule of room.rules) {
    if (rule.skipCurrent) {
      rule.skipCurrent = false;
      continue;
    }
    rule.questionsInRound++;
    if (rule.questionsInRound >= participants) {
      rule.remainingRounds--;
      rule.questionsInRound = 0;
    }
  }
  room.rules = room.rules.filter(rule => rule.remainingRounds > 0);
}

export function setChallenge(room: RoomState, challenge: Challenge, player: Player): void {
  room.challenge = challenge;
  room.challengeCompleted = false;
  room.turnId = randomUUID();
  room.assignedPlayerId = player.id;
  room.timerEndsAt = null;
  room.timerStatus = 'idle';
  if (challenge.duration_type === 'rounds' && challenge.duration_value > 0) {
    room.rules.push({
      id: randomUUID(),
      challengeContent: challenge.content,
      targetUsername: player.username,
      remainingRounds: challenge.duration_value,
      questionsInRound: 0,
      skipCurrent: true
    });
  }
}
