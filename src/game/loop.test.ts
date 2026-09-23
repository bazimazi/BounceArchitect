import { describe, expect, it } from 'vitest';
import { deg } from '../level/factory';
import { levelById } from '../level/campaign';
import { dailyLevel } from '../level/daily';
import { validateBuild } from '../level/validate';
import { freshSave, loadSave, writeSave, type Store } from '../progress/save';
import { isLevelOpen } from '../progress/unlock';
import { ensureRecord } from '../progress/save';
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
  it('keeps a secret behind three medals and the path behind one', () => {
    const save = freshSave();
    const secret = levelById('w1-quiet');
    const springs = levelById('w2-store');
    expect(secret && springs).toBeTruthy();
    expect(isLevelOpen(secret!, save)).toBe(false);
    expect(isLevelOpen(springs!, save)).toBe(false);
    ensureRecord(save, 'w1-gap').reach = true;
    ensureRecord(save, 'w1-turn').reach = true;
    ensureRecord(save, 'w1-steps').reach = true;
    expect(isLevelOpen(springs!, save)).toBe(false);
    const record = ensureRecord(save, 'w1-narrow');
    record.reach = true;
    expect(isLevelOpen(springs!, save)).toBe(true);
    expect(isLevelOpen(secret!, save)).toBe(false);
    record.lean = true;
    record.swift = true;
    expect(isLevelOpen(secret!, save)).toBe(true);
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
    store.setItem('bounce-architect-save-v1', '{');
    expect(loadSave(store).levels['w1-gap']).toBeUndefined();
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
