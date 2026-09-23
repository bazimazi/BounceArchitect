import { AudioBus } from '../audio/audio';
import { deg, piece } from '../level/factory';
import { LEVELS, levelById, levelsInWorld, worldOf, WORLDS } from '../level/campaign';
import { CATALOG, CATEGORY_LABEL } from '../level/catalog';
import { dailyCard, dailyLevel, dayKey } from '../level/daily';
import { cleanTitle, isClean } from '../level/moderate';
import { parseLevel, validateBuild } from '../level/validate';
import { knownKinds, workshopLevel } from '../level/workshop';
import { medalNote, mergeMedals, rankTitle } from '../progress/medals';
import { ensureRecord, freshSave, loadSave, writeSave, type SaveData } from '../progress/save';
import { firstUnsolved, isLevelOpen, nextLinearId, secretFrom, totalMedals } from '../progress/unlock';
import { remaining } from '../editor/budget';
import { sameAllowance } from '../editor/budget';
import { createState, FIXED_DT, step, toSim, type SimState } from '../physics/sim';
import { drawWorld } from '../render/draw';
import { fitCamera, screenToWorld, type Camera } from '../render/camera';
import { Shell, type PlayView, type ViewModel } from '../ui/shell';
import { Session } from './session';

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

  constructor(root: HTMLElement) {
    this.save = loadSave();
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
      }
      return;
    }
    this.attractAcc += dt;
    const level = toSim(this.attractLevel, this.attractPieces);
    while (this.attractAcc >= FIXED_DT) {
      step(level, this.attractSim);
      this.attractAcc -= FIXED_DT;
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
        trail: [],
        sim: this.attractSim,
        mode: this.save.settings.reducedMotion ? 'build' : 'run',
        time,
        reducedMotion: this.save.settings.reducedMotion,
        highContrast: this.save.settings.highContrast,
        showColliders: false,
        particles: [],
        shake: 0,
        accent: '#C2410C',
        devText: '',
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
        camera: session.camera,
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
      });
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  private view(): ViewModel {
    const medals = totalMedals(this.save);
    const daily = dailyCard(this.save);
    const current = firstUnsolved(this.save);
    const play = this.playView();
    const key = this.viewKey(play, daily.done, daily.name, medals);
    return {
      key,
      screen: this.screen,
      clock: play?.mode === 'run' ? `${(this.session?.clock ?? 0).toFixed(1)}s` : '',
      hasProgress: this.hasProgress(),
      rank: rankTitle(medals),
      medalTotal: medals,
      worlds: WORLDS.map((world) => {
        const levels = levelsInWorld(world.id).filter((level) => !level.secret || isLevelOpen(level, this.save));
        const open = levels.some((level) => isLevelOpen(level, this.save));
        return {
          id: world.id,
          kicker: world.kicker,
          name: world.name,
          lesson: world.lesson,
          accent: world.accent,
          open,
          levels: open
            ? levels.map((level) => ({
                id: level.id,
                name: level.name,
                summary: level.summary,
                open: isLevelOpen(level, this.save),
                secret: Boolean(level.secret),
                reach: Boolean(this.save.levels[level.id]?.reach),
                lean: Boolean(this.save.levels[level.id]?.lean),
                swift: Boolean(this.save.levels[level.id]?.swift),
                current: level.id === current,
              }))
            : [],
        };
      }),
      daily: { name: daily.name, blurb: daily.blurb, open: daily.open, done: daily.done },
      play,
      notes: knownKinds(this.save).map((kind) => ({
        category: CATEGORY_LABEL[CATALOG[kind].category],
        name: CATALOG[kind].name,
        blurb: CATALOG[kind].blurb,
      })),
      confirm: this.confirm,
      settings: {
        ...this.save.settings,
        launches: this.save.stats.launches,
        solves: this.save.stats.solves,
        hints: this.save.stats.hints,
      },
    };
  }

  private playView(): PlayView | null {
    const session = this.session;
    if (!session || (this.screen !== 'play' && this.screen !== 'workshop')) return null;
    const world = worldOf(session.level.worldId);
    const record = this.save.levels[session.level.id];
    const selected = session.pieces.find((piece) => piece.uid === session.selected[0]);
    const tool = session.tool === null ? undefined : session.level.palette[session.tool];
    const nextId = session.sandbox ? undefined : nextLinearId(session.level.id);
    const secret = session.outcome === 'won' && !session.sandbox ? secretFrom(session.level.id, this.save) : undefined;
    return {
      sandbox: session.sandbox,
      kicker: session.sandbox ? 'Workshop' : `${world?.kicker ?? 'Puzzle'} · ${world?.name ?? ''}`.trim(),
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
      chips: session.level.palette.map((allowance, index) => {
        const left = remaining(session.pieces, session.level.palette, index);
        const finishing = allowance.kind === 'portal' && session.pendingLink !== null;
        return {
          index,
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
        session.attempts >= 4 &&
        session.hintIndex >= 4 &&
        !record?.reach,
      confirm: this.confirm,
      nextName: nextId ? (levelById(nextId)?.name ?? null) : null,
      secretNote: secret ? `${secret.name} is open on the map.` : '',
      follow: session.follow,
      showGhost: session.showGhost,
      hasGhost: session.ghost.length > 0,
      issues: this.notice,
      drafts: this.save.drafts.map((draft) => ({ id: draft.id, name: draft.name })),
    };
  }

  private viewKey(play: PlayView | null, dailyDone: boolean, dailyName: string, medals: number): string {
    if (this.screen === 'title') return `title|${this.hasProgress()}`;
    if (this.screen === 'map') return `map|${medals}|${dailyDone}|${dailyName}|${firstUnsolved(this.save)}`;
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
    if (act === 'begin' || act === 'continue') {
      this.openLevel(this.hasProgress() ? firstUnsolved(this.save) : 'w1-gap');
      return;
    }
    if (act === 'daily') {
      const card = dailyCard(this.save);
      if (card.open) this.openLevel(dailyLevel().id);
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
      const next = nextLinearId(session.level.id);
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
    this.session = new Session(level, { attempts: record?.attempts ?? 0, hints: record?.hints ?? 0 });
    this.session.reducedMotion = this.save.settings.reducedMotion;
    this.screen = 'play';
    this.confirm = '';
    this.notice = '';
    this.seenAttempts = this.session.attempts;
    this.seenHints = this.session.hintIndex;
    this.winToken = '';
    this.lesson = '';
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
    record.reach = true;
    this.confirm = '';
    this.persist();
    const next = nextLinearId(session.level.id);
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
        const merged = mergeMedals(record, session.medals);
        record.reach = merged.reach;
        record.lean = merged.lean;
        record.swift = merged.swift;
        record.bestTime = Math.min(record.bestTime, session.sim.t);
        record.bestPieces = Math.min(record.bestPieces, session.pieces.length);
        if (!wasReach) this.save.stats.solves += 1;
        if (dailyLevel().id === session.level.id) {
          this.save.dailies[dayKey()] = { levelId: session.level.id, done: true };
        }
        changed = true;
      }
    }
    if (changed && !this.persist()) session.toast = session.toast || 'This device could not store that progress.';
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

  private hasProgress(): boolean {
    return Object.values(this.save.levels).some((record) => record.attempts > 0 || record.reach);
  }

  private clearedGap(session: Session): boolean {
    return Boolean(this.save.levels['w1-gap']?.reach || session.medals.reach);
  }
}

function buzz(ms: number, enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
}
