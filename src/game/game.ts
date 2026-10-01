import { AudioBus } from '../audio/audio';
import { deg, piece } from '../level/factory';
import { LEVELS, levelById, levelsInWorld, linearLevels, newKinds, worldOf, WORLDS } from '../level/campaign';
import { CATALOG, CATEGORY_LABEL } from '../level/catalog';
import { dailiesDone, dailyCard, dailyFor, dayKey, longestStreak } from '../level/daily';
import { cleanTitle, isClean } from '../level/moderate';
import { parseLevel, validateBuild } from '../level/validate';
import { knownKinds, workshopLevel } from '../level/workshop';
import { medalCount, medalNote, mergeMedals, nextRank, rankTitle } from '../progress/medals';
import { activeFinish, FINISHES, finishById, finishesOpened, finishOpen, type Finish, type Unlocks } from '../progress/finishes';
import { awardFeats, FEATS, featProgress, perfectWorlds, type Feat } from '../progress/feats';
import { chaseList } from '../progress/chase';
import type { Level } from '../core/types';
import { ensureRecord, freshSave, loadSave, writeSave, type SaveData } from '../progress/save';
import {
  campaignDone,
  clearedInWorld,
  clearsToAdvance,
  firstUnsolved,
  isLevelOpen,
  isWorldOpen,
  lockReason,
  nextLevelId,
  openLevelIds,
  totalMedals,
} from '../progress/unlock';
import { remaining } from '../editor/budget';
import { sameAllowance } from '../editor/budget';
import { createState, FIXED_DT, step, toSim, type SimState } from '../physics/sim';
import { drawWorld } from '../render/draw';
import { fitCamera, screenToWorld, type Camera } from '../render/camera';
import { Shell, type PlayView, type ViewModel } from '../ui/shell';
import { emptyFx, Session } from './session';

type Screen = ViewModel['screen'];

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly chrome: HTMLElement;
  private readonly live: HTMLElement;
  private readonly shell: Shell;
  private readonly audio = new AudioBus();
  private save: SaveData;
  private screen: Screen = 'title';
  private session: Session | null = null;
  private confirm: '' | 'skip' | 'clear' | 'reset' = '';
  private lesson = '';
  private notice = '';
  private boardRev = 0;
  private dev = false;
  private fps = 60;
  private last = 0;
  private cssW = 1280;
  private cssH = 720;
  private dpr = 1;
  private lastSize = '';
  private seenAttempts = 0;
  private seenHints = 0;
  private winToken = '';
  private lastSpoken = '';
  private visit = 0;
  /** What the last win opened: worlds, levels, finishes, a new rank. Shown on the result card. */
  private rewards: string[] = [];
  /** A line that floats over any screen for a few seconds, such as a feat landing. */
  private flash = '';
  private flashUntil = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private panning = false;
  private panLast = { x: 0, y: 0 };
  private attractLevel = levelById('w1-gap') ?? LEVELS[0]!;
  private attractPieces = [piece('demo', 'ramp', 7.5, 4.35, 7.5, 0.22, deg(-30))];
  private attractSim: SimState | null = null;
  private attractAcc = 0;
  private attractHold = 0;
  private attractCamera: Camera = fitCamera(this.attractLevel.view, 1280, 720);
  private attractFx = emptyFx();
  private attractTrails: { x: number; y: number }[][] = [];

  constructor(root: HTMLElement) {
    this.save = loadSave();
    // Saves from before feats existed get what they have already done, quietly.
    if (awardFeats(this.save).length > 0) this.persist();
    root.innerHTML = '<canvas id="board" aria-label="Construction board"></canvas><div id="chrome"></div><div id="live" class="sr" aria-live="polite"></div>';
    const canvas = root.querySelector('#board');
    const chrome = root.querySelector('#chrome');
    const live = root.querySelector('#live');
    if (!(canvas instanceof HTMLCanvasElement) || !(chrome instanceof HTMLElement) || !(live instanceof HTMLElement)) {
      throw new Error('Bounce Architect could not build its board.');
    }
    this.canvas = canvas;
    this.chrome = chrome;
    this.live = live;
    this.shell = new Shell(chrome);
    this.applySettings();
    this.bind();
  }

  start(): void {
    const loop = (now: number) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.08;
    if (this.flash && now > this.flashUntil) this.flash = '';
    this.syncCanvas();
    if (this.screen === 'title') this.tickAttract(dt);
    const session = this.session;
    if (session && (this.screen === 'play' || this.screen === 'workshop')) {
      session.reducedMotion = this.save.settings.reducedMotion;
      session.tick(dt);
      for (const sound of session.drainSounds()) {
        this.audio.play(sound);
        if (sound === 'win') buzz(16, this.save.settings.haptics);
        if (sound === 'launch') buzz(8, this.save.settings.haptics);
      }
      this.syncProgress(session);
      this.speak(this.speech(session));
    }
    this.audio.tick();
    this.paint(now / 1000);
    this.shell.sync(this.view());
  }

  private speech(session: Session): string {
    if (session.outcome === 'won' && session.sim) {
      return `The ring holds. ${medalNote(session.medals, session.pieces.length, session.sim.t, session.level.medals)}`;
    }
    if (session.toast) return session.toast;
    if (session.hintText()) return session.hintText();
    return session.guide(this.clearedGap(session));
  }

  private speak(text: string): void {
    if (!text || text === this.lastSpoken) return;
    this.lastSpoken = text;
    this.live.textContent = text;
  }

  private tickAttract(dt: number): void {
    if (!this.attractSim) this.attractSim = createState(toSim(this.attractLevel, this.attractPieces));
    if (this.save.settings.reducedMotion || !this.attractSim) return;
    if (this.attractSim.phase !== 'running') {
      this.attractHold += dt;
      if (this.attractHold > 1.1) {
        this.attractSim = createState(toSim(this.attractLevel, this.attractPieces));
        this.attractHold = 0;
        this.attractAcc = 0;
        this.attractTrails = [];
        this.attractFx = emptyFx();
      }
      return;
    }
    this.attractAcc += dt;
    const level = toSim(this.attractLevel, this.attractPieces);
    while (this.attractAcc >= FIXED_DT) {
      step(level, this.attractSim);
      this.attractAcc -= FIXED_DT;
      this.attractSim.balls.forEach((ball, index) => {
        const trail = this.attractTrails[index] ?? (this.attractTrails[index] = []);
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(ball.x - last.x, ball.y - last.y) > 0.04) {
          trail.push({ x: ball.x, y: ball.y });
          if (trail.length > 240) trail.shift();
        }
        const fx = this.attractFx.balls.get(ball.id) ?? { spin: 0, amp: 0, age: 1, nx: 0, ny: 1 };
        fx.spin -= ball.vx * FIXED_DT / ball.r;
        this.attractFx.balls.set(ball.id, fx);
      });
      if (this.attractSim.phase !== 'running') break;
    }
  }

  private paint(time: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    if (this.screen === 'title') {
      drawWorld(ctx, {
        width: this.cssW,
        height: this.cssH,
        dpr: this.dpr,
        camera: this.attractCamera,
        level: this.attractLevel,
        pieces: this.attractPieces,
        starts: this.attractLevel.starts,
        goals: this.attractLevel.goals,
        selected: [],
        hover: null,
        hoverOk: false,
        guides: [],
        preview: [],
        ghost: [],
        trail: this.attractTrails,
        sim: this.attractSim,
        mode: this.save.settings.reducedMotion ? 'build' : 'run',
        time,
        reducedMotion: this.save.settings.reducedMotion,
        highContrast: this.save.settings.highContrast,
        showColliders: false,
        particles: [],
        shake: 0,
        accent: '#EEC17D',
        devText: '',
        fx: this.attractFx,
        ball: this.ballFinish(),
      });
      return;
    }
    if ((this.screen === 'play' || this.screen === 'workshop') && this.session) {
      const session = this.session;
      const world = worldOf(session.level.worldId);
      const ball = session.sim?.balls[0];
      drawWorld(ctx, {
        width: this.cssW,
        height: this.cssH,
        dpr: this.dpr,
        camera: session.viewCamera(),
        level: session.level,
        pieces: session.pieces,
        starts: session.starts,
        goals: session.goals,
        selected: session.selected,
        hover: session.hover,
        hoverOk: session.hoverOk,
        guides: session.guides,
        preview: session.mode === 'build' ? session.preview : [],
        ghost: session.showGhost ? session.ghost : [],
        trail: session.mode === 'run' ? session.trail : [],
        sim: session.sim,
        mode: session.mode,
        time,
        reducedMotion: this.save.settings.reducedMotion,
        highContrast: this.save.settings.highContrast,
        showColliders: this.dev,
        particles: session.particles,
        shake: session.shake,
        accent: world?.accent ?? '#EA580C',
        devText: this.dev
          ? `${this.fps.toFixed(0)} fps  ${session.mode}  ${session.sim?.phase ?? 'build'}  ${ball ? `${ball.vx.toFixed(1)}, ${ball.vy.toFixed(1)}` : ''}`
          : '',
        fx: session.fx,
        ball: this.ballFinish(),
      });
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#091E25';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  private view(): ViewModel {
    const medals = totalMedals(this.save);
    const medalMax = LEVELS.length * 3;
    const daily = dailyCard(this.save);
    const current = firstUnsolved(this.save);
    const play = this.playView();
    const key = this.viewKey(play, daily.done, daily.name, medals);
    const upcoming = nextRank(medals, medalMax);
    const unlocks = this.unlocks();
    const finish = activeFinish(this.save.settings.finish, unlocks);
    const featsEarned = FEATS.filter((feat) => this.save.feats[feat.id] !== undefined).length;
    return {
      key,
      screen: this.screen,
      clock: play?.mode === 'run' ? `${(this.session?.clock ?? 0).toFixed(1)}s` : '',
      hasProgress: this.hasProgress(),
      rank: rankTitle(medals, medalMax),
      nextRank: upcoming
        ? `${upcoming.need} more medal${upcoming.need === 1 ? '' : 's'} to ${upcoming.title}`
        : 'Top rank. Every line is clean.',
      medalTotal: medals,
      medalMax,
      finishes: FINISHES.map((entry) => {
        const open = finishOpen(entry, unlocks);
        return {
          id: entry.id,
          name: entry.name,
          label: open ? entry.name : `${entry.name}, ${this.finishLock(entry)}`,
          tag: entry.feat ? '★' : `${entry.need}`,
          band: entry.band,
          body: entry.body[1],
          open,
          selected: finish.id === entry.id,
        };
      }),
      worlds: WORLDS.map((world, worldIndex) => {
        const all = levelsInWorld(world.id);
        const levels = all.filter((level) => !level.secret || isLevelOpen(level, this.save));
        // The meter tracks the campaign levels. A secret's medals count toward rank, not here.
        const counted = all.filter((level) => !level.secret);
        const earned = counted.reduce((sum, level) => sum + medalCount(this.save.levels[level.id]), 0);
        const total = counted.length * 3;
        const open = isWorldOpen(world.id, this.save);
        const previous = WORLDS[worldIndex - 1];
        const left = previous ? clearsToAdvance(previous.id) - clearedInWorld(previous.id, this.save) : 0;
        return {
          id: world.id,
          number: worldIndex + 1,
          kicker: world.kicker,
          name: world.name,
          lesson: world.lesson,
          accent: world.accent,
          open,
          lock: previous && !open ? `Clear ${Math.max(1, left)} more in ${previous.name} to open it.` : '',
          introduces: newKinds(world.id).map((kind) => CATALOG[kind].name),
          earned,
          total,
          perfect: total > 0 && earned === total,
          levels: open
            ? levels.map((level, levelIndex) => {
                const record = this.save.levels[level.id];
                const unlocked = isLevelOpen(level, this.save);
                return {
                  id: level.id,
                  number: levelIndex + 1,
                  name: level.name,
                  summary: level.summary,
                  open: unlocked,
                  lock: unlocked ? '' : lockReason(level, this.save),
                  secret: Boolean(level.secret),
                  passed: Boolean(record?.passed && !record.reach),
                  reach: Boolean(record?.reach),
                  lean: Boolean(record?.lean),
                  swift: Boolean(record?.swift),
                  current: level.id === current,
                };
              })
            : [],
        };
      }),
      daily: { name: daily.name, blurb: daily.blurb, open: daily.open, done: daily.done, streak: daily.streak, best: daily.best },
      chase: chaseList(this.save).flatMap((entry) => {
        const level = levelById(entry.levelId);
        return level ? [{ id: level.id, code: codeFor(level), name: level.name, medal: entry.medal, note: entry.note }] : [];
      }),
      feats: { earned: featsEarned, total: FEATS.length },
      log: this.screen === 'log' ? this.logView(medals, medalMax) : { stats: [], feats: [], earned: featsEarned },
      flash: this.flash,
      play,
      notes: knownKinds(this.save).map((kind) => ({
        kind,
        category: CATEGORY_LABEL[CATALOG[kind].category],
        name: CATALOG[kind].name,
        blurb: CATALOG[kind].blurb,
      })),
      confirm: this.confirm,
      settings: { ...this.save.settings },
    };
  }

  private logView(medals: number, medalMax: number): ViewModel['log'] {
    const records = LEVELS.map((level) => this.save.levels[level.id]);
    const count = (test: (record: NonNullable<(typeof records)[number]>) => boolean) =>
      records.filter((record) => record && test(record)).length;
    const streak = longestStreak(this.save);
    const feats = FEATS.map((feat) => this.featCard(feat));
    return {
      stats: [
        { label: 'medals', value: `${medals}/${medalMax}` },
        { label: 'solved', value: `${count((record) => record.reach)}` },
        { label: 'flawless', value: `${count((record) => medalCount(record) === 3)}` },
        { label: 'first-launch clears', value: `${count((record) => Boolean(record.reach && record.firstTry))}` },
        { label: 'worlds perfected', value: `${perfectWorlds(this.save)}/${WORLDS.length}` },
        { label: 'launches', value: `${this.save.stats.launches}` },
        { label: 'hints', value: `${this.save.stats.hints}` },
        { label: 'daily blueprints', value: `${dailiesDone(this.save)}` },
        { label: 'best streak', value: `${streak} day${streak === 1 ? '' : 's'}` },
      ],
      feats,
      earned: feats.filter((feat) => feat.done).length,
    };
  }

  private featCard(feat: Feat): ViewModel['log']['feats'][number] {
    const progress = featProgress(feat, this.save);
    const secret = feat.hidden && !progress.done;
    const reward = FINISHES.find((finish) => finish.feat === feat.id);
    const when = this.save.feats[feat.id];
    return {
      id: feat.id,
      name: secret ? 'Unmarked' : feat.name,
      blurb: secret ? 'Somewhere off the plans.' : feat.blurb,
      have: progress.have,
      need: progress.need,
      done: progress.done,
      when: when === undefined ? '' : new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      reward: reward && !secret ? reward.name : '',
    };
  }

  private finishLock(finish: Finish): string {
    if (!finish.feat) return `opens at ${finish.need} medals`;
    const feat = FEATS.find((entry) => entry.id === finish.feat);
    if (!feat || feat.hidden) return 'opens with a hidden feat';
    return `opens with the ${feat.name} feat`;
  }

  private playView(): PlayView | null {
    const session = this.session;
    if (!session || (this.screen !== 'play' && this.screen !== 'workshop')) return null;
    const world = worldOf(session.level.worldId);
    const record = this.save.levels[session.level.id];
    const selected = session.pieces.find((piece) => piece.uid === session.selected[0]);
    const tool = session.tool === null ? undefined : session.level.palette[session.tool];
    const nextId = session.sandbox ? undefined : nextLevelId(session.level.id, this.save);
    return {
      sandbox: session.sandbox,
      kicker: session.sandbox ? 'Workshop' : `${world?.kicker ?? 'Puzzle'} · ${world?.name ?? ''}`.trim(),
      code: session.sandbox ? '' : codeFor(session.level),
      title: session.level.name,
      summary: session.level.summary,
      guide: session.guide(this.clearedGap(session)),
      lesson: session.guide(this.clearedGap(session)) ? '' : this.lesson,
      toast: session.toast,
      hint: session.hintText(),
      hintStep: session.hintIndex === 0 ? 'Hint' : `Hint ${session.hintIndex}/${session.level.hints.length}`,
      outcome: session.outcome,
      medalNote:
        session.outcome === 'won' && session.sim
          ? medalNote(session.medals, session.pieces.length, session.sim.t, session.level.medals)
          : '',
      saved: {
        reach: Boolean(record?.reach),
        lean: Boolean(record?.lean),
        swift: Boolean(record?.swift),
      },
      now: session.medals,
      targets: session.level.medals,
      stats: {
        time: `${(session.sim?.t ?? 0).toFixed(2)}s`,
        pieces: session.pieces.length,
        launches: session.attempts,
      },
      visit: this.visit,
      chips: session.level.palette.map((allowance, index) => {
        const left = remaining(session.pieces, session.level.palette, index);
        const finishing = allowance.kind === 'portal' && session.pendingLink !== null;
        return {
          index,
          kind: allowance.kind,
          left: finishing ? 1 : left,
          label: allowance.label ?? CATALOG[allowance.kind].name,
          meta: allowance.kind === 'portal' ? (finishing ? 'Place the exit' : `${Math.max(0, left)} pair${left === 1 ? '' : 's'}`) : `${Math.max(0, left)} left`,
          selected: session.tool === index,
          empty: left <= 0 && !finishing,
        };
      }),
      mode: session.mode,
      paused: session.paused,
      speed: session.speed,
      attempts: session.attempts,
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      hasSelection: session.selected.length > 0,
      canReplace: Boolean(selected && tool && !sameAllowance(selected, tool)),
      canLink: selected?.kind === 'door',
      snapLabel: session.snapLabel(),
      showSkip:
        !session.sandbox &&
        session.outcome !== 'won' &&
        (session.losses >= 3 || session.attempts >= 8) &&
        !record?.reach &&
        !record?.passed,
      nudgeHint:
        !session.sandbox &&
        session.outcome !== 'won' &&
        session.losses >= 2 &&
        session.hintIndex < Math.min(session.level.hints.length, session.losses - 1),
      confirm: this.confirm,
      nextName: nextId ? (levelById(nextId)?.name ?? null) : null,
      rewards: session.outcome === 'won' ? this.rewards : [],
      best:
        !session.sandbox && record?.reach && Number.isFinite(record.bestTime) && Number.isFinite(record.bestPieces)
          ? `Your best: ${record.bestTime.toFixed(2)}s · ${record.bestPieces} piece${record.bestPieces === 1 ? '' : 's'}`
          : '',
      follow: session.follow,
      showGhost: session.showGhost,
      hasGhost: session.ghost.length > 0,
      issues: this.notice,
      drafts: this.save.drafts.map((draft) => ({ id: draft.id, name: draft.name })),
    };
  }

  private viewKey(play: PlayView | null, dailyDone: boolean, dailyName: string, medals: number): string {
    return `${this.screenKey(play, dailyDone, dailyName, medals)}#${this.flash}`;
  }

  private screenKey(play: PlayView | null, dailyDone: boolean, dailyName: string, medals: number): string {
    const feats = Object.keys(this.save.feats).length;
    if (this.screen === 'title') return `title|${this.hasProgress()}|${medals}`;
    if (this.screen === 'map') {
      return `map|${medals}|${feats}|${dailyDone}|${dailyName}|${firstUnsolved(this.save)}|${this.save.settings.finish}|${this.progressKey()}`;
    }
    if (this.screen === 'log') return `log|${medals}|${feats}|${this.save.stats.launches}`;
    if (this.screen === 'notes') return `notes|${knownKinds(this.save).join(',')}`;
    if (this.screen === 'settings') return `settings|${this.confirm}|${this.save.settings.uiScale}`;
    if (!play || !this.session) return this.screen;
    const chips = play.chips.map((chip) => `${chip.meta}:${chip.selected}`).join(',');
    return [
      'play',
      this.session.level.id,
      play.mode,
      `|${play.outcome ?? 'none'}|`,
      play.paused,
      play.speed,
      this.session.tool ?? '-',
      this.session.selected.join('.'),
      play.hintStep,
      play.toast,
      play.guide,
      this.lesson,
      play.snapLabel,
      this.confirm,
      play.showSkip,
      play.canUndo,
      play.canRedo,
      play.follow,
      play.showGhost,
      play.hasGhost,
      chips,
      this.notice,
      this.boardRev,
      play.attempts,
      play.now.reach,
      play.now.lean,
      play.now.swift,
      play.saved.reach,
      play.saved.lean,
      play.saved.swift,
      play.visit,
      play.nudgeHint,
      play.rewards.join('/'),
      play.best,
    ].join('~');
  }

  private action(act: string): void {
    this.audio.unlock();
    if (!['skip', 'skip-yes', 'clear', 'clear-yes', 'reset', 'reset-yes'].includes(act)) this.confirm = '';
    if (act === 'title') {
      this.screen = 'title';
      return;
    }
    if (act === 'map' || act === 'back') {
      this.screen = 'map';
      this.lesson = '';
      return;
    }
    if (act === 'notes') {
      this.screen = 'notes';
      return;
    }
    if (act === 'settings') {
      this.screen = 'settings';
      return;
    }
    if (act === 'log') {
      this.screen = 'log';
      return;
    }
    if (act === 'begin' || act === 'continue') {
      const next = this.hasProgress() ? firstUnsolved(this.save) : 'w1-gap';
      if (next) this.openLevel(next);
      else this.screen = 'map';
      return;
    }
    if (act === 'daily') {
      const today = dayKey();
      const { level } = dailyFor(this.save);
      // Pin today's pick, so opening more of the campaign does not swap it out mid-day.
      if (!this.save.dailies[today]) {
        this.save.dailies[today] = { levelId: level.id, done: false };
        this.persist();
      }
      this.openLevel(level.id);
      return;
    }
    if (act.startsWith('finish:')) {
      const id = act.slice(7);
      const finish = finishById(id);
      if (finish.id === id && finishOpen(finish, this.unlocks())) {
        this.save.settings.finish = id;
        this.persist();
      }
      return;
    }
    if (act === 'workshop') {
      this.openWorkshop();
      return;
    }
    if (act.startsWith('level:')) {
      this.openLevel(act.slice(6));
      return;
    }
    if (act === 'reset') {
      this.confirm = 'reset';
      return;
    }
    if (act === 'reset-yes') {
      this.save = freshSave();
      this.persist();
      this.session = null;
      this.screen = 'title';
      this.confirm = '';
      this.applySettings();
      return;
    }
    if (act.startsWith('scale:')) {
      const scale = Number(act.slice(6));
      if (scale === 1 || scale === 1.15 || scale === 1.3) {
        this.save.settings.uiScale = scale;
        this.applySettings();
        this.persist();
      }
      return;
    }
    const session = this.session;
    if (!session) return;
    if (act === 'launch' || act === 'restart') {
      session.launch();
      return;
    }
    if (act === 'pause') {
      session.togglePause();
      return;
    }
    if (act === 'edit') {
      session.edit();
      return;
    }
    if (act === 'step') {
      session.stepFrame();
      return;
    }
    if (act === 'undo') session.undo();
    else if (act === 'redo') session.redo();
    else if (act === 'rot-left') session.rotate(-1);
    else if (act === 'rot-right') session.rotate(1);
    else if (act === 'duplicate') session.duplicate();
    else if (act === 'delete') session.removeSelected();
    else if (act === 'snap') session.cycleSnap();
    else if (act === 'hint') session.hint();
    else if (act === 'frame') session.frame();
    else if (act === 'follow') session.follow = !session.follow;
    else if (act === 'ghost') session.showGhost = !session.showGhost;
    else if (act === 'replace') session.replaceSelected();
    else if (act === 'link') session.linkDoor();
    else if (act === 'nudge-l') session.nudge(-1, 0);
    else if (act === 'nudge-r') session.nudge(1, 0);
    else if (act === 'nudge-u') session.nudge(0, 1);
    else if (act === 'nudge-d') session.nudge(0, -1);
    else if (act.startsWith('tool:')) session.selectTool(Number(act.slice(5)));
    else if (act.startsWith('speed:')) session.setSpeed(Number(act.slice(6)));
    else if (act === 'next') {
      const next = nextLevelId(session.level.id, this.save);
      if (next) this.openLevel(next);
      else this.screen = 'map';
    } else if (act === 'skip') this.confirm = 'skip';
    else if (act === 'skip-yes') this.skipLevel(session);
    else if (act === 'clear') this.confirm = 'clear';
    else if (act === 'clear-yes') {
      session.clearBoard();
      this.confirm = '';
    } else if (act === 'validate') this.notice = this.inspection(session);
    else if (act === 'save-draft') this.saveDraft(session);
    else if (act === 'export') this.exportLevel(session);
    else if (act === 'import') {
      const input = this.chrome.querySelector('#level-file');
      if (input instanceof HTMLInputElement) input.click();
    } else if (act === 'new-bench') this.openWorkshop();
  }

  private openLevel(id: string): void {
    const level = levelById(id);
    if (!level || !isLevelOpen(level, this.save)) return;
    const record = this.save.levels[id];
    this.visit += 1;
    this.session = new Session(level, { attempts: record?.attempts ?? 0, hints: record?.hints ?? 0 });
    this.session.reducedMotion = this.save.settings.reducedMotion;
    this.screen = 'play';
    this.confirm = '';
    this.notice = '';
    this.seenAttempts = this.session.attempts;
    this.seenHints = this.session.hintIndex;
    this.winToken = '';
    this.lesson = '';
    this.rewards = [];
    const world = worldOf(level.worldId);
    if (world && !this.save.seenWorlds.includes(world.id)) {
      this.save.seenWorlds.push(world.id);
      this.lesson = world.lesson;
      this.persist();
    }
    this.syncCanvas();
    this.session.resize(this.cssW, this.cssH, this.chromeInset());
    this.canvas.setAttribute('aria-label', `${level.name} construction board`);
  }

  private openWorkshop(): void {
    this.session = new Session(workshopLevel(knownKinds(this.save)), { sandbox: true });
    this.session.reducedMotion = this.save.settings.reducedMotion;
    this.screen = 'workshop';
    this.confirm = '';
    this.notice = '';
    this.lesson = '';
    this.boardRev += 1;
    this.syncCanvas();
    this.session.resize(this.cssW, this.cssH, this.chromeInset());
  }

  private skipLevel(session: Session): void {
    const record = ensureRecord(this.save, session.level.id);
    record.passed = true;
    this.confirm = '';
    this.persist();
    const next = nextLevelId(session.level.id, this.save);
    if (next) this.openLevel(next);
    else this.screen = 'map';
  }

  private syncProgress(session: Session): void {
    if (session.sandbox) return;
    let changed = false;
    const record = ensureRecord(this.save, session.level.id);
    if (session.attempts !== this.seenAttempts) {
      const delta = session.attempts - this.seenAttempts;
      if (delta > 0) this.save.stats.launches += delta;
      this.seenAttempts = session.attempts;
      record.attempts = Math.max(record.attempts, session.attempts);
      changed = true;
    }
    if (session.hintIndex !== this.seenHints) {
      const delta = session.hintIndex - this.seenHints;
      if (delta > 0) this.save.stats.hints += delta;
      this.seenHints = session.hintIndex;
      record.hints = Math.max(record.hints, session.hintIndex);
      changed = true;
    }
    if (session.outcome === 'won' && session.sim) {
      const token = `${session.attempts}:${session.sim.t.toFixed(3)}`;
      if (token !== this.winToken) {
        this.winToken = token;
        const wasReach = record.reach;
        const before = this.snapshot();
        const time = session.sim.t;
        const pieces = session.pieces.length;
        const bests: string[] = [];
        if (wasReach && Number.isFinite(record.bestTime) && time < record.bestTime - 0.005) {
          bests.push(`New best time: ${time.toFixed(2)}s, down from ${record.bestTime.toFixed(2)}s.`);
        }
        if (wasReach && Number.isFinite(record.bestPieces) && pieces < record.bestPieces) {
          bests.push(`New best build: ${pieces} piece${pieces === 1 ? '' : 's'}, down from ${record.bestPieces}.`);
        }
        const merged = mergeMedals(record, session.medals);
        record.reach = merged.reach;
        record.lean = merged.lean;
        record.swift = merged.swift;
        record.bestTime = Math.min(record.bestTime, time);
        record.bestPieces = Math.min(record.bestPieces, pieces);
        // Session counts carry over from earlier visits, so these read the whole history.
        if (session.attempts === 1) record.firstTry = true;
        if (session.hintIndex === 0) record.unaided = true;
        if (!wasReach) this.save.stats.solves += 1;
        if (dailyFor(this.save).level.id === session.level.id) {
          this.save.dailies[dayKey()] = { levelId: session.level.id, done: true };
        }
        awardFeats(this.save);
        this.rewards = [...this.rewardsSince(before), ...bests];
        changed = true;
      }
    } else if (changed) {
      // A feat can land without a win, such as the hundredth launch.
      this.announce(awardFeats(this.save));
    }
    if (changed && !this.persist()) session.toast = session.toast || 'This device could not store that progress.';
  }

  private announce(feats: Feat[]): void {
    if (feats.length === 0) return;
    this.flash = feats.map((feat) => `Feat earned: ${feat.name}`).join(' · ');
    this.flashUntil = this.last + 4200;
  }

  private saveDraft(session: Session): void {
    const name = cleanTitle(session.level.name) || 'Untitled bench';
    if (!isClean(name)) {
      this.notice = 'Choose a different name.';
      return;
    }
    session.setName(name);
    const existing = this.save.drafts.find((draft) => draft.name === name);
    const draft = {
      id: existing?.id ?? `draft-${Date.now().toString(36)}`,
      name,
      updated: Date.now(),
      level: {
        ...session.level,
        name,
        starts: structuredClone(session.starts),
        goals: structuredClone(session.goals),
      },
      pieces: structuredClone(session.pieces),
    };
    this.save.drafts = [draft, ...this.save.drafts.filter((entry) => entry.id !== draft.id)].slice(0, 12);
    this.boardRev += 1;
    this.notice = this.persist() ? 'Draft saved on this device.' : 'This device could not store that draft.';
  }

  private exportLevel(session: Session): void {
    const name = cleanTitle(session.level.name) || 'Untitled bench';
    if (!isClean(name)) {
      this.notice = 'Choose a different name.';
      return;
    }
    const level = {
      ...session.level,
      name,
      starts: structuredClone(session.starts),
      goals: structuredClone(session.goals),
      environment: [...session.level.environment, ...session.pieces],
    };
    const issues = validateBuild(level, []);
    const blocking = issues.find((issue) => issue.severity === 'error');
    if (blocking) {
      this.notice = blocking.message;
      return;
    }
    const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.notice = 'Exported. Another player can import it in the workshop.';
    this.save.stats.exports += 1;
    this.announce(awardFeats(this.save));
    this.persist();
  }

  private importFile(file: File): void {
    void file.text().then((raw) => {
      const parsed = parseLevel(raw);
      if (!parsed.level) {
        this.notice = parsed.error ?? 'That file could not be read.';
        return;
      }
      const imported = parsed.level;
      const base = workshopLevel(knownKinds(this.save));
      const stage = imported.environment.find((piece) => piece.uid === 'stage');
      base.name = cleanTitle(imported.name) || base.name;
      base.summary = imported.summary || base.summary;
      base.environment = stage ? [stage] : base.environment;
      base.gravity = imported.gravity || base.gravity;
      base.maxTime = imported.maxTime || base.maxTime;
      base.view = imported.view ?? base.view;
      base.starts = imported.starts.length ? imported.starts : base.starts;
      base.goals = imported.goals.length ? imported.goals : base.goals;
      const pieces = imported.environment.filter((piece) => piece.uid !== 'stage');
      this.session = new Session(base, { sandbox: true });
      this.session.loadBoard(pieces, base.starts, base.goals);
      this.session.setName(base.name);
      this.screen = 'workshop';
      this.boardRev += 1;
      this.notice = 'Imported into the workshop.';
      this.syncCanvas();
      this.session.resize(this.cssW, this.cssH, this.chromeInset());
    });
  }

  private loadDraft(id: string): void {
    const draft = this.save.drafts.find((entry) => entry.id === id);
    if (!draft) return;
    this.session = new Session(draft.level, { sandbox: true });
    this.session.loadBoard(draft.pieces, draft.level.starts, draft.level.goals);
    this.session.setName(draft.name);
    this.screen = 'workshop';
    this.boardRev += 1;
    this.notice = '';
    this.syncCanvas();
    this.session.resize(this.cssW, this.cssH, this.chromeInset());
  }

  private inspection(session: Session): string {
    const issues = validateBuild({ ...session.level, starts: session.starts, goals: session.goals }, session.pieces);
    if (issues.length === 0) return 'Ready to test. This checks the setup. It does not prove a solution.';
    return issues.map((issue) => `${issue.severity === 'error' ? 'Needs a fix' : 'Note'}: ${issue.message}`).join(' ');
  }

  private bind(): void {
    this.chrome.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('[data-act]');
      if (!(button instanceof HTMLElement) || !button.dataset.act) return;
      if (button instanceof HTMLButtonElement && button.disabled) return;
      event.preventDefault();
      this.action(button.dataset.act);
    });
    this.chrome.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.act === 'name') this.session?.setName(target.value);
      if (target.dataset.setting) this.onSetting(target);
    });
    this.chrome.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.dataset.draft) {
        if (target.value) this.loadDraft(target.value);
        return;
      }
      if (target instanceof HTMLInputElement && target.id === 'level-file') {
        const file = target.files?.[0];
        if (file) this.importFile(file);
        target.value = '';
        return;
      }
      if (target instanceof HTMLInputElement && target.dataset.setting) this.onSetting(target);
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointermove', (event) => {
      if (event.target !== this.canvas && !this.pointers.has(event.pointerId)) this.session?.clearHover();
    });
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    window.addEventListener('keydown', (event) => this.onKey(event));
    window.addEventListener('resize', () => this.syncCanvas(true));
  }

  private onSetting(input: HTMLInputElement): void {
    const key = input.dataset.setting;
    if (key === 'music' || key === 'sfx') {
      const value = Number(input.value);
      this.save.settings[key] = value;
      const label = this.chrome.querySelector(`[data-for="${key}"]`);
      if (label) label.textContent = `${Math.round(value * 100)}%`;
    } else if (key === 'haptics' || key === 'reducedMotion' || key === 'highContrast') {
      this.save.settings[key] = input.checked;
    } else return;
    this.applySettings();
    this.persist();
  }

  private onWheel(event: WheelEvent): void {
    if (!this.session || (this.screen !== 'play' && this.screen !== 'workshop')) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.session.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.001));
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.screen !== 'play' && this.screen !== 'workshop') return;
    this.audio.unlock();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size >= 2) {
      this.pinchDist = this.pointerSpan();
      this.session?.cancelDrag();
      return;
    }
    if (event.button === 1 || event.button === 2 || event.altKey) {
      this.panning = true;
      this.panLast = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;
    const world = this.worldAt(event);
    if (world) this.session?.pointerDown(world.x, world.y, event.shiftKey);
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.screen !== 'play' && this.screen !== 'workshop') return;
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size >= 2 && this.session && this.pinchDist > 0) {
      const dist = this.pointerSpan();
      const mid = this.pointerMid();
      const rect = this.canvas.getBoundingClientRect();
      this.session.zoomAt(mid.x - rect.left, mid.y - rect.top, dist / this.pinchDist);
      this.pinchDist = dist;
      return;
    }
    if (this.panning && this.session && this.pointers.has(event.pointerId)) {
      this.session.pan(event.clientX - this.panLast.x, event.clientY - this.panLast.y);
      this.panLast = { x: event.clientX, y: event.clientY };
      return;
    }
    const world = this.worldAt(event);
    if (world) this.session?.pointerMove(world.x, world.y);
  }

  private onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0) {
      this.panning = false;
      this.session?.pointerUp();
    }
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if (event.key === 'Escape') {
      if (typing && target instanceof HTMLElement) {
        target.blur();
        return;
      }
      if (this.session && (this.screen === 'play' || this.screen === 'workshop')) {
        if (this.session.mode === 'run') this.session.edit();
        else if (this.session.selected.length > 0) this.session.selected = [];
        else if (this.session.tool !== null) this.session.selectTool(null);
      }
      return;
    }
    if (typing) return;
    if (event.key === '`' || event.key === '~') {
      this.dev = !this.dev;
      return;
    }
    if ((this.screen === 'title' || this.screen === 'map') && event.key === 'Enter') {
      if (target instanceof HTMLElement && target.dataset.act) return;
      this.action(this.screen === 'title' ? 'begin' : 'continue');
      return;
    }
    const session = this.session;
    if (!session || (this.screen !== 'play' && this.screen !== 'workshop')) return;
    if (event.key === ' ' && target instanceof HTMLElement && target.dataset.act) return;
    const meta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (meta && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if (meta && key === 'y') {
      event.preventDefault();
      session.redo();
      return;
    }
    if (meta && key === 'd') {
      event.preventDefault();
      session.duplicate();
      return;
    }
    if (event.repeat && (event.key === ' ' || event.key === 'Enter')) return;
    if (event.key === ' ') {
      event.preventDefault();
      session.launch();
      return;
    }
    if (key === 'p') session.togglePause();
    else if (key === 'g') session.cycleSnap();
    else if (key === 'f') session.follow = !session.follow;
    else if (key === 'h') session.frame();
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      session.removeSelected();
    } else if (key === 'q' || event.key === '[') session.rotate(-1, event.shiftKey);
    else if (key === 'e' || event.key === ']') session.rotate(1, event.shiftKey);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const x = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const y = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      if (session.selected.length > 0 && session.mode === 'build') session.nudge(x, y, event.shiftKey);
      else session.pan(-x * 48, y * 48);
    } else if (event.key >= '1' && event.key <= '9') {
      const index = Number(event.key) - 1;
      if (index < session.level.palette.length) session.selectTool(index);
    } else if (event.key === '.' && session.mode === 'run') session.stepFrame();
  }

  private worldAt(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (!this.session) return null;
    const rect = this.canvas.getBoundingClientRect();
    return screenToWorld(this.session.camera, rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top);
  }

  private pointerSpan(): number {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pointerMid(): { x: number; y: number } {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private syncCanvas(force = false): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width || window.innerWidth;
    this.cssH = rect.height || window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.cssW * this.dpr));
    const height = Math.max(1, Math.floor(this.cssH * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const size = `${Math.round(this.cssW)}x${Math.round(this.cssH)}`;
    if (force || size !== this.lastSize) {
      this.lastSize = size;
      this.attractCamera = fitCamera(this.attractLevel.view, this.cssW, this.cssH);
      if (this.cssW > 620) {
        const previewWidth = this.cssW * 0.51;
        this.attractCamera = fitCamera(this.attractLevel.view, previewWidth, this.cssH * 0.66);
        // Position the real experiment in the right half of the cover.
        this.attractCamera.x -= this.cssW * 0.225 / this.attractCamera.zoom;
        this.attractCamera.y += this.cssH * 0.015 / this.attractCamera.zoom;
      }
      this.session?.resize(this.cssW, this.cssH, this.chromeInset());
    }
  }

  private chromeInset(): { top: number; bottom: number } {
    if (this.screen !== 'play' && this.screen !== 'workshop') return { top: 0, bottom: 0 };
    const narrow = this.cssW < 760;
    const workshop = this.screen === 'workshop' ? (narrow ? 86 : 64) : 0;
    return { top: (narrow ? 132 : 108) + workshop, bottom: narrow ? 210 : 148 };
  }

  private applySettings(): void {
    const root = document.documentElement;
    root.dataset.contrast = this.save.settings.highContrast ? 'high' : 'normal';
    root.dataset.motion = this.save.settings.reducedMotion ? 'reduce' : 'full';
    root.style.fontSize = `${16 * this.save.settings.uiScale}px`;
    this.audio.setMusic(this.save.settings.music);
    this.audio.setSfx(this.save.settings.sfx);
    if (this.session) this.session.reducedMotion = this.save.settings.reducedMotion;
  }

  private persist(): boolean {
    return writeSave(this.save);
  }

  private snapshot(): { open: Set<string>; worlds: Set<string>; medals: number; done: boolean; unlocks: Unlocks } {
    return {
      open: openLevelIds(this.save),
      worlds: new Set(WORLDS.filter((world) => isWorldOpen(world.id, this.save)).map((world) => world.id)),
      medals: totalMedals(this.save),
      done: campaignDone(this.save),
      unlocks: { medals: totalMedals(this.save), feats: { ...this.save.feats } },
    };
  }

  private unlocks(): Unlocks {
    return { medals: totalMedals(this.save), feats: this.save.feats };
  }

  /** Plain lines for everything a win just opened, biggest news first. */
  private rewardsSince(before: ReturnType<Game['snapshot']>): string[] {
    const after = this.snapshot();
    const max = LEVELS.length * 3;
    const lines: string[] = [];
    if (after.done && !before.done) lines.push(`Every world cleared. ${after.medals} of ${max} medals so far.`);
    for (const world of WORLDS) {
      if (after.worlds.has(world.id) && !before.worlds.has(world.id)) lines.push(`${world.kicker} is open: ${world.name}.`);
    }
    for (const level of LEVELS) {
      if (!after.open.has(level.id) || before.open.has(level.id)) continue;
      if (level.secret) lines.push(`Secret: ${level.name} is open on the map.`);
      else if (before.worlds.has(level.worldId)) lines.push(`${level.name} is open.`);
    }
    const rank = rankTitle(after.medals, max);
    if (rank !== rankTitle(before.medals, max)) lines.push(`New rank: ${rank}.`);
    for (const feat of FEATS) {
      if (after.unlocks.feats[feat.id] !== undefined && before.unlocks.feats[feat.id] === undefined) {
        lines.push(`Feat: ${feat.name}. ${feat.blurb}`);
      }
    }
    for (const finish of finishesOpened(before.unlocks, after.unlocks)) {
      lines.push(`New ball finish: ${finish.name}. Pick it on the map.`);
    }
    return lines;
  }

  private ballFinish() {
    return activeFinish(this.save.settings.finish, this.unlocks());
  }

  /** Changes whenever a clear or pass lands, so the map redraws its locks. */
  private progressKey(): string {
    return linearLevels()
      .map((level) => (this.save.levels[level.id]?.reach ? 'r' : this.save.levels[level.id]?.passed ? 'p' : '-'))
      .join('');
  }

  private hasProgress(): boolean {
    return Object.values(this.save.levels).some((record) => record.attempts > 0 || record.reach || record.passed);
  }

  private clearedGap(session: Session): boolean {
    return Boolean(this.save.levels['w1-gap']?.reach || session.medals.reach);
  }
}

/** The short code a level goes by, like 3-2. */
function codeFor(level: Level): string {
  if (level.secret) return 'Secret';
  const worldIndex = WORLDS.findIndex((world) => world.id === level.worldId);
  const index = levelsInWorld(level.worldId).findIndex((entry) => entry.id === level.id);
  if (worldIndex < 0 || index < 0) return '';
  return `${worldIndex + 1}-${index + 1}`;
}

function buzz(ms: number, enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
}
