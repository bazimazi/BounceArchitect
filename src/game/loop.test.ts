import { describe, expect, it } from 'vitest';
import { deg } from '../level/factory';
import { LEVELS, levelById, linearLevels } from '../level/campaign';
import { dailyFor, dailyLevel, dailyStreak, dayKey } from '../level/daily';
import { validateBuild } from '../level/validate';
import { freshSave, loadSave, writeSave, type Store } from '../progress/save';
import { firstUnsolved, isLevelOpen, lockReason, nextLevelId, totalMedals } from '../progress/unlock';
import { nextRank, rankTitle } from '../progress/medals';
import { activeFinish, FINISHES, finishesOpened } from '../progress/finishes';
import { ensureRecord } from '../progress/save';
import { awardFeats, featById, featProgress, FEATS, perfectWorlds } from '../progress/feats';
import { chaseList } from '../progress/chase';
import { longestStreak } from '../level/daily';
import { Session } from './session';

describe('play loop', () => {
  it('solves the first gap from a placed ramp', () => {
    const level = levelById('w1-gap');
    expect(level).toBeTruthy();
    const session = new Session(level!);
    session.setSnap(0);
    session.selectTool(0);
    session.setRotation(deg(-30));
    expect(session.placeAt(7.5, 4.35)).toBe(true);
    session.launch();
    for (let i = 0; i < 1400; i += 1) session.tick(1 / 120);
    expect(session.outcome).toBe('won');
    expect(session.medals.reach).toBe(true);
    expect(session.medals.lean).toBe(true);
  });

  it('still solves the first gap on the default grid', () => {
    const session = new Session(levelById('w1-gap')!);
    session.selectTool(0);
    session.rotate(-1);
    session.rotate(-1);
    expect(session.placeAt(7.5, 4.35)).toBe(true);
    const placed = session.pieces[0];
    expect(placed?.y).toBeCloseTo(4.25);
    session.launch();
    for (let i = 0; i < 1400; i += 1) session.tick(1 / 120);
    expect(session.outcome).toBe('won');
  });

  it('undoes a placement', () => {
    const session = new Session(levelById('w1-gap')!);
    session.selectTool(0);
    session.placeAt(7, 4);
    expect(session.pieces).toHaveLength(1);
    session.undo();
    expect(session.pieces).toHaveLength(0);
    session.redo();
    expect(session.pieces).toHaveLength(1);
  });
});

describe('progress', () => {
  it('keeps a secret behind three medals and the next world behind most of this one', () => {
    const save = freshSave();
    const secret = levelById('w1-quiet');
    const springs = levelById('w2-store');
    expect(secret && springs).toBeTruthy();
    expect(isLevelOpen(secret!, save)).toBe(false);
    expect(isLevelOpen(springs!, save)).toBe(false);
    ensureRecord(save, 'w1-gap').reach = true;
    ensureRecord(save, 'w1-turn').reach = true;
    expect(isLevelOpen(springs!, save)).toBe(false);
    const record = ensureRecord(save, 'w1-narrow');
    record.reach = true;
    expect(isLevelOpen(springs!, save)).toBe(true);
    expect(isLevelOpen(secret!, save)).toBe(false);
    record.lean = true;
    record.swift = true;
    expect(isLevelOpen(secret!, save)).toBe(true);
  });

  it('opens a world one teaching level at a time, then keeps a spare open', () => {
    const save = freshSave();
    expect(isLevelOpen(levelById('w1-gap')!, save)).toBe(true);
    expect(isLevelOpen(levelById('w1-turn')!, save)).toBe(false);
    ensureRecord(save, 'w1-gap').reach = true;
    expect(isLevelOpen(levelById('w1-turn')!, save)).toBe(true);
    expect(isLevelOpen(levelById('w1-steps')!, save)).toBe(true);
    expect(isLevelOpen(levelById('w1-narrow')!, save)).toBe(false);
    expect(lockReason(levelById('w1-narrow')!, save)).toBe('Clear 1 more here');
    expect(lockReason(levelById('w2-store')!, save)).toBe('Clear 2 more in First Bounce');
  });

  it('lets a pass open the way without granting a medal', () => {
    const save = freshSave();
    ensureRecord(save, 'w1-gap').passed = true;
    expect(isLevelOpen(levelById('w1-turn')!, save)).toBe(true);
    expect(totalMedals(save)).toBe(0);
    expect(firstUnsolved(save)).toBe('w1-turn');
    ensureRecord(save, 'w1-turn').reach = true;
    ensureRecord(save, 'w1-steps').reach = true;
    ensureRecord(save, 'w1-narrow').reach = true;
    // Every open level in the first world is cleared, so Next heads into the new world.
    expect(nextLevelId('w1-narrow', save)).toBe('w2-store');
  });

  it('returns to a passed level once nothing new is waiting', () => {
    const save = freshSave();
    for (const level of linearLevels()) ensureRecord(save, level.id).reach = true;
    const record = ensureRecord(save, 'w3-uphill');
    record.reach = false;
    record.passed = true;
    expect(firstUnsolved(save)).toBe('w3-uphill');
    expect(nextLevelId('w7-hard', save)).toBe('w3-uphill');
    record.reach = true;
    expect(firstUnsolved(save)).toBeUndefined();
  });

  it('scales ranks and finishes to the medals on offer', () => {
    const max = LEVELS.length * 3;
    expect(rankTitle(0, max)).toBe('Apprentice');
    expect(rankTitle(max, max)).toBe('Master Architect');
    expect(nextRank(max, max)).toBeNull();
    expect(nextRank(0, max)?.title).toBe('Draftsman');
    expect(FINISHES.every((finish) => finish.need <= max)).toBe(true);
    expect(activeFinish('gilded', { medals: 0, feats: {} }).id).toBe('workshop');
    expect(finishesOpened({ medals: 5, feats: {} }, { medals: 6, feats: {} }).map((finish) => finish.id)).toEqual(['brass']);
    expect(activeFinish('ember', { medals: max, feats: {} }).id).toBe('workshop');
    expect(activeFinish('ember', { medals: 0, feats: { 'full-week': 1 } }).id).toBe('ember');
    expect(FINISHES.filter((finish) => finish.feat).every((finish) => featById(finish.feat!))).toBe(true);
  });

  it('gives a stand-in daily when the shared one is still locked, and counts a streak', () => {
    const save = freshSave();
    const date = new Date(2026, 8, 23);
    const today = dailyFor(save, date);
    expect(isLevelOpen(today.level, save)).toBe(true);
    save.dailies[dayKey(date)] = { levelId: today.level.id, done: true };
    const yesterday = new Date(2026, 8, 22);
    save.dailies[dayKey(yesterday)] = { levelId: 'w1-gap', done: true };
    expect(dailyStreak(save, date)).toBe(2);
    expect(dailyStreak(save, new Date(2026, 8, 24))).toBe(2);
    expect(dailyStreak(save, new Date(2026, 8, 26))).toBe(0);
  });

  it('round-trips a save and rejects a broken one', () => {
    const memory = new Map<string, string>();
    const store: Store = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
    const save = freshSave();
    ensureRecord(save, 'w1-gap').reach = true;
    expect(writeSave(save, store)).toBe(true);
    expect(loadSave(store).levels['w1-gap']?.reach).toBe(true);
    // Infinity does not survive JSON, and an unset best must not come back as zero.
    ensureRecord(save, 'w1-turn').attempts = 2;
    writeSave(save, store);
    expect(loadSave(store).levels['w1-turn']?.bestTime).toBe(Infinity);
    expect(loadSave(store).feats).toEqual({});
    store.setItem('bounce-architect-save-v1', '{');
    expect(loadSave(store).levels['w1-gap']).toBeUndefined();
  });

  it('finds the longest daily run anywhere in the history', () => {
    const save = freshSave();
    for (const day of [1, 2, 3, 4, 10, 11]) save.dailies[dayKey(new Date(2026, 7, day))] = { levelId: 'w1-gap', done: true };
    save.dailies[dayKey(new Date(2026, 7, 5))] = { levelId: 'w1-gap', done: false };
    expect(longestStreak(save)).toBe(4);
    // Runs cross month ends.
    save.dailies[dayKey(new Date(2026, 6, 31))] = { levelId: 'w1-gap', done: true };
    expect(longestStreak(save)).toBe(5);
  });

  it('awards feats once, keeps them, and reports progress toward the rest', () => {
    const save = freshSave();
    expect(awardFeats(save)).toEqual([]);
    const record = ensureRecord(save, 'w1-gap');
    record.reach = true;
    record.firstTry = true;
    record.unaided = true;
    const landed = awardFeats(save, 42).map((feat) => feat.id);
    expect(landed).toEqual(['first-ring', 'called-it']);
    expect(save.feats['first-ring']).toBe(42);
    expect(awardFeats(save)).toEqual([]);
    const notes = featById('no-notes')!;
    expect(featProgress(notes, save)).toEqual({ have: 1, need: 5, done: false });
    // An earned feat stays earned, even if the count behind it changes.
    record.reach = false;
    expect(featProgress(featById('first-ring')!, save).done).toBe(true);
    expect(new Set(FEATS.map((feat) => feat.id)).size).toBe(FEATS.length);
  });

  it('counts a world as perfect only when every campaign level has all three medals', () => {
    const save = freshSave();
    for (const id of ['w1-gap', 'w1-turn', 'w1-steps']) Object.assign(ensureRecord(save, id), { reach: true, lean: true, swift: true });
    expect(perfectWorlds(save)).toBe(0);
    Object.assign(ensureRecord(save, 'w1-narrow'), { reach: true, lean: true, swift: false });
    expect(perfectWorlds(save)).toBe(0);
    ensureRecord(save, 'w1-narrow').swift = true;
    expect(perfectWorlds(save)).toBe(1);
    expect(awardFeats(save).map((feat) => feat.id)).toContain('signature');
  });

  it('lists the medals a best build came closest to', () => {
    const save = freshSave();
    const gap = levelById('w1-gap')!;
    const turn = levelById('w1-turn')!;
    Object.assign(ensureRecord(save, gap.id), {
      reach: true,
      lean: true,
      bestPieces: gap.medals.pieces,
      bestTime: gap.medals.seconds * 2,
    });
    Object.assign(ensureRecord(save, turn.id), {
      reach: true,
      swift: true,
      bestPieces: turn.medals.pieces + 1,
      bestTime: turn.medals.seconds,
    });
    const list = chaseList(save);
    expect(list.find((entry) => entry.levelId === gap.id)?.medal).toBe('swift');
    expect(list.map((entry) => entry.levelId).sort()).toEqual([gap.id, turn.id].sort());
    expect(list.find((entry) => entry.levelId === turn.id)?.note).toBe('1 piece over Lean');
    expect(list[0]!.gap).toBeLessThanOrEqual(list[1]!.gap);
    // A level without a Reach has no best build to measure, so it is not listed.
    expect(chaseList(freshSave())).toEqual([]);
  });

  it('picks the same daily blueprint for a date', () => {
    const date = new Date(2026, 8, 23);
    expect(dailyLevel(date).id).toBe(dailyLevel(date).id);
    expect(dailyLevel(date).id.length).toBeGreaterThan(0);
  });
});

describe('workshop checks', () => {
  it('asks for a goal before a level can be shared', () => {
    const level = levelById('w1-gap');
    expect(level).toBeTruthy();
    const broken = { ...level!, goals: [] };
    expect(validateBuild(broken, []).some((issue) => issue.severity === 'error')).toBe(true);
    expect(validateBuild(level!, []).every((issue) => issue.severity !== 'error')).toBe(true);
  });
});
