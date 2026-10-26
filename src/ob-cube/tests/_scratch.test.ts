import { it } from 'vitest';
import { applyMove, createSolvedState, fingerprintState, parseMove } from '../src/engine';
import type { CubeState } from '../src/engine';
import type { CubeSize } from '../src/contracts';
import { createPuzzle, generateScramble, normalizeSeed } from '../src/puzzle';

function run(state: CubeState, moves: readonly string[]): CubeState {
  return moves.reduce((acc, move) => applyMove(acc, parseMove(move, acc.size)), state);
}

it('print anchors', () => {
  for (const size of [2, 3, 4] as CubeSize[]) {
    console.log(`solved-${size}`, fingerprintState(createSolvedState(size)));
    const seed = normalizeSeed('demo-2026');
    console.log(`seed32-${size}`, seed.hex);
    const scramble = generateScramble(size, seed.seed32, size === 2 ? 11 : size === 3 ? 20 : 30);
    console.log(`scramble-${size}`, scramble.join(' '));
    const state = run(createSolvedState(size), scramble);
    console.log(`initial-${size}`, fingerprintState(state));
    const puzzle = createPuzzle({ size, seed: 'demo-2026', createdAt: '2026-01-01T00:00:00.000Z' });
    console.log(`challengeId-${size}`, puzzle.challenge_id, puzzle.scramble_fingerprint);
    // 打乱后逆序逆操作
    const back = run(state, [...scramble].reverse().map((m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`)));
    console.log(`roundtrip-${size}`, fingerprintState(back));
  }
});
