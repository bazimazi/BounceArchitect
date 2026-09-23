import type { BallStart, Goal, Piece } from '../core/types';

export interface BoardState {
  pieces: Piece[];
  starts: BallStart[];
  goals: Goal[];
}

export function cloneBoard(board: BoardState): BoardState {
  return structuredClone(board);
}

export class History {
  private past: BoardState[] = [];
  private future: BoardState[] = [];

  constructor(private present: BoardState) {}

  current(): BoardState {
    return this.present;
  }

  commit(next: BoardState): void {
    this.past.push(structuredClone(this.present));
    if (this.past.length > 100) this.past.shift();
    this.present = structuredClone(next);
    this.future = [];
  }

  resetPresent(board: BoardState): void {
    this.present = board;
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(structuredClone(this.present));
    this.present = previous;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(structuredClone(this.present));
    this.present = next;
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
