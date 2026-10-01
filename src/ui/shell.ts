export interface MedalBits {
  reach: boolean;
  lean: boolean;
  swift: boolean;
}

export interface ChipView {
  index: number;
  kind: string;
  label: string;
  meta: string;
  left: number;
  selected: boolean;
  empty: boolean;
}

export interface LevelNode {
  id: string;
  number: number;
  name: string;
  summary: string;
  open: boolean;
  /** Why a locked level is locked, in a few words. */
  lock: string;
  secret: boolean;
  /** Skipped ahead without a Reach. */
  passed: boolean;
  reach: boolean;
  lean: boolean;
  swift: boolean;
  current: boolean;
}

export interface WorldCard {
  id: string;
  number: number;
  kicker: string;
  name: string;
  lesson: string;
  accent: string;
  open: boolean;
  /** What opens a locked world. */
  lock: string;
  /** Mechanics this world is the first to bring in. */
  introduces: string[];
  earned: number;
  total: number;
  /** Every medal on offer here is earned. */
  perfect: boolean;
  levels: LevelNode[];
}

export interface FinishChip {
  id: string;
  name: string;
  /** Its name, or what a shut finish still wants, as a spoken label. */
  label: string;
  /** Short mark on a shut swatch: a medal count, or a star for a feat. */
  tag: string;
  band: string;
  body: string;
  open: boolean;
  selected: boolean;
}

export interface ChaseRow {
  id: string;
  code: string;
  name: string;
  medal: 'lean' | 'swift';
  note: string;
}

export interface FeatCard {
  id: string;
  name: string;
  blurb: string;
  have: number;
  need: number;
  done: boolean;
  /** Date the feat landed, when it has. */
  when: string;
  /** The ball finish it opens, if any. */
  reward: string;
}

export interface LogView {
  stats: { label: string; value: string }[];
  feats: FeatCard[];
  earned: number;
}

export interface NoteCard {
  kind: string;
  category: string;
  name: string;
  blurb: string;
}

export interface DraftRow {
  id: string;
  name: string;
}

export interface PlayView {
  sandbox: boolean;
  kicker: string;
  code: string;
  title: string;
  summary: string;
  guide: string;
  lesson: string;
  toast: string;
  hint: string;
  hintStep: string;
  outcome: 'won' | 'lost' | null;
  medalNote: string;
  saved: MedalBits;
  now: MedalBits;
  targets: { pieces: number; seconds: number };
  stats: { time: string; pieces: number; launches: number };
  chips: ChipView[];
  mode: 'build' | 'run';
  paused: boolean;
  speed: number;
  attempts: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  canReplace: boolean;
  canLink: boolean;
  snapLabel: string;
  showSkip: boolean;
  /** Several misses and no hint yet. The hint button leans forward. */
  nudgeHint: boolean;
  confirm: '' | 'skip' | 'clear' | 'reset';
  nextName: string | null;
  /** Everything the win just opened. */
  rewards: string[];
  /** This player's best clear so far, in a few words. Empty until reached. */
  best: string;
  follow: boolean;
  showGhost: boolean;
  hasGhost: boolean;
  issues: string;
  drafts: DraftRow[];
  /** Changes each time a level opens, so the intro card plays once per visit. */
  visit: number;
}

export interface ViewModel {
  key: string;
  screen: 'title' | 'map' | 'play' | 'workshop' | 'notes' | 'settings' | 'log';
  clock: string;
  hasProgress: boolean;
  rank: string;
  nextRank: string;
  medalTotal: number;
  medalMax: number;
  finishes: FinishChip[];
  worlds: WorldCard[];
  daily: { name: string; blurb: string; open: boolean; done: boolean; streak: number; best: number };
  /** Medals the best builds so far came close to. */
  chase: ChaseRow[];
  feats: { earned: number; total: number };
  log: LogView;
  /** A short line that floats over any screen, such as a feat landing. */
  flash: string;
  play: PlayView | null;
  notes: NoteCard[];
  confirm: '' | 'skip' | 'clear' | 'reset';
  settings: {
    music: number;
    sfx: number;
    haptics: boolean;
    reducedMotion: boolean;
    highContrast: boolean;
    uiScale: number;
  };
}

/**
 * Renders the HTML chrome over the board. The chrome is rebuilt whenever the view key
 * changes, so entrance animations are tagged with data-enter and only play the first
 * time a token appears, and focus follows the control that had it.
 */
export class Shell {
  private key = '';
  private screen = '';
  private seen = new Set<string>();

  constructor(private root: HTMLElement) {}

  sync(vm: ViewModel): void {
    if (vm.key !== this.key) {
      const previous = this.key;
      this.key = vm.key;
      const active = document.activeElement;
      const focusAct = active instanceof HTMLElement && this.root.contains(active) ? active.dataset.act : undefined;
      const scroller = this.root.querySelector('.screen');
      const scroll = vm.screen === this.screen && scroller ? scroller.scrollTop : 0;
      this.screen = vm.screen;
      this.root.innerHTML = render(vm);
      const tokens = new Set<string>();
      for (const el of this.root.querySelectorAll<HTMLElement>('[data-enter]')) {
        const token = el.dataset.enter ?? '';
        tokens.add(token);
        if (this.seen.has(token)) el.classList.add('settled');
      }
      this.seen = tokens;
      const nextScroller = this.root.querySelector('.screen');
      if (nextScroller && scroll) nextScroller.scrollTop = scroll;
      if (vm.play?.outcome === 'won' && !previous.includes('|won|')) {
        const next = this.root.querySelector('.result .primary');
        if (next instanceof HTMLElement) next.focus({ preventScroll: true });
      } else if (focusAct) {
        const again = this.root.querySelector(`[data-act="${CSS.escape(focusAct)}"]`);
        if (again instanceof HTMLElement && !(again instanceof HTMLButtonElement && again.disabled)) {
          again.focus({ preventScroll: true });
        }
      }
    }
    const clock = this.root.querySelector('[data-bind="clock"]');
    if (clock) clock.textContent = vm.clock;
  }
}

function render(vm: ViewModel): string {
  return renderScreen(vm) + flash(vm.flash);
}

function renderScreen(vm: ViewModel): string {
  if (vm.screen === 'title') return renderTitle(vm);
  if (vm.screen === 'map') return renderMap(vm);
  if (vm.screen === 'notes') return renderNotes(vm);
  if (vm.screen === 'settings') return renderSettings(vm);
  if (vm.screen === 'log') return renderLog(vm);
  return renderPlay(vm);
}

function flash(text: string): string {
  if (!text) return '';
  return `<p class="flash" role="status" data-enter="flash:${esc(text)}">${icon('star')}<span>${esc(text)}</span></p>`;
}

function renderTitle(vm: ViewModel): string {
  return `<div class="title-wrap">
    <section class="title-card" data-enter="title">
      ${emblem()}
      <p class="kicker title-kicker stagger" style="--i:1">Physics puzzle</p>
      <h1 class="wordmark stagger" style="--i:2"><span>Bounce</span> <span>Architect</span></h1>
      <p class="lede stagger" style="--i:3">You don’t control the ball. You engineer the world around it.</p>
      ${
        vm.hasProgress
          ? `<p class="title-stat stagger" style="--i:4">${medalGlyph('reach', true)} <span>${esc(vm.rank)} · ${vm.medalTotal} of ${vm.medalMax} medals</span></p>`
          : ''
      }
      <div class="row stagger" style="--i:5">
        <button class="primary big" type="button" data-act="begin">${icon('play')}<span>${vm.hasProgress ? 'Continue' : 'Begin'}</span></button>
        <button class="ghost big" type="button" data-act="map">${icon('map')}<span>Campaign</span></button>
      </div>
      <div class="row quiet stagger" style="--i:6">
        <button class="text" type="button" data-act="workshop">Workshop</button>
        <button class="text" type="button" data-act="notes">Field notes</button>
        ${vm.hasProgress ? '<button class="text" type="button" data-act="log">Logbook</button>' : ''}
        <button class="text" type="button" data-act="settings">Settings</button>
      </div>
    </section>
  </div>`;
}

function renderMap(vm: ViewModel): string {
  const share = vm.medalMax > 0 ? Math.round((vm.medalTotal / vm.medalMax) * 100) : 0;
  return `<main class="screen map">
    <header class="sheet-head">
      <div class="row spread">
        <button class="text" type="button" data-act="title">${icon('back')} Title</button>
        <button class="icon" type="button" data-act="settings" aria-label="Settings" title="Settings">${icon('gear')}</button>
      </div>
      <p class="kicker">Campaign</p>
      <h1>The board</h1>
      <div class="rank-card card" data-enter="rank">
        <span class="rank-badge" aria-hidden="true">${medalGlyph('reach', true)}</span>
        <div class="rank-text">
          <strong>${esc(vm.rank)}</strong>
          <span>${vm.medalTotal} of ${vm.medalMax} medals · ${esc(vm.nextRank)}</span>
          <span>${vm.feats.earned} of ${vm.feats.total} feats</span>
        </div>
        <div class="meter" role="img" aria-label="${share}% of medals"><span style="--fill:${share}%"></span></div>
        ${finishRow(vm.finishes)}
      </div>
      <div class="row">
        <button class="primary" type="button" data-act="continue">${icon('play')}<span>Continue</span></button>
        <button class="ghost" type="button" data-act="workshop">${icon('wrench')}<span>Workshop</span></button>
        <button class="ghost" type="button" data-act="log">${icon('trophy')}<span>Logbook</span></button>
        <button class="ghost" type="button" data-act="notes">${icon('book')}<span>Field notes</span></button>
      </div>
    </header>
    <section class="card daily${vm.daily.done ? ' done-card' : ''}" data-enter="daily">
      <span class="daily-icon" aria-hidden="true">${icon('calendar')}</span>
      <div class="daily-text">
        <p class="kicker">Daily blueprint</p>
        <h2>${esc(vm.daily.name)}</h2>
        <p>${esc(vm.daily.blurb)}</p>
        ${vm.daily.done ? `<p class="done">${icon('check')} Done today.</p>` : ''}
        ${streakLine(vm.daily.streak, vm.daily.best)}
      </div>
      ${vm.daily.open ? `<button class="${vm.daily.done ? 'ghost' : 'primary'}" type="button" data-act="daily">${vm.daily.done ? 'Play it again' : 'Play today’s blueprint'}</button>` : ''}
    </section>
    ${chaseCard(vm.chase)}
    ${vm.worlds.map(renderWorld).join('')}
  </main>`;
}

function renderWorld(world: WorldCard, index: number): string {
  if (!world.open) {
    return `<section class="world locked" style="--world:${esc(world.accent)}; --i:${index}" data-enter="world:${esc(world.id)}">
      <header class="world-head">
        <span class="world-no" aria-hidden="true">${icon('lock')}</span>
        <div>
          <p class="kicker">${esc(world.kicker)}</p>
          <h2>${esc(world.name)}</h2>
        </div>
      </header>
      <p class="muted">${esc(world.lock || 'Still ahead.')}</p>
      ${introduces(world)}
    </section>`;
  }
  const share = world.total > 0 ? Math.round((world.earned / world.total) * 100) : 0;
  return `<section class="world${world.perfect ? ' perfect' : ''}" style="--world:${esc(world.accent)}; --i:${index}" data-enter="world:${esc(world.id)}">
    <header class="world-head">
      <span class="world-no" aria-hidden="true">${world.number}</span>
      <div>
        <p class="kicker">${esc(world.kicker)}</p>
        <h2>${esc(world.name)}</h2>
      </div>
      <div class="world-meter" title="${world.earned} of ${world.total} medals">
        ${world.perfect ? `<span class="perfect-tag">${icon('star')}Perfected</span>` : ''}
        <span class="count">${world.earned}<small>/${world.total}</small></span>
        <div class="meter"><span style="--fill:${share}%"></span></div>
      </div>
    </header>
    <p class="lesson-line">${esc(world.lesson)}</p>
    ${introduces(world)}
    <ol class="tiles">
      ${world.levels.map((level, i) => renderTile(world, level, i)).join('')}
    </ol>
  </section>`;
}

function renderTile(world: WorldCard, level: LevelNode, index: number): string {
  const code = level.secret ? '★' : `${world.number}-${level.number}`;
  if (!level.open) {
    return `<li style="--i:${index}"><button class="tile locked" type="button" disabled aria-label="${esc(level.name)}, locked. ${esc(level.lock)}">
      <span class="tile-no">${icon('lock')}</span>
      <strong>${esc(level.name)}</strong>
      <small>${esc(level.lock || 'Locked')}</small>
    </button></li>`;
  }
  const count = Number(level.reach) + Number(level.lean) + Number(level.swift);
  const state = level.current ? ' current' : count === 3 ? ' perfect' : level.reach ? ' cleared' : level.passed ? ' passed' : '';
  const tag = level.current ? (level.passed ? 'Retry' : 'Next') : level.passed ? 'Passed' : '';
  return `<li style="--i:${index}"><button class="tile${state}${level.secret ? ' secret' : ''}" type="button" data-act="level:${esc(level.id)}" title="${esc(level.summary)}">
    ${tag ? `<span class="tile-tag${level.passed && !level.current ? ' quiet' : ''}">${tag}</span>` : ''}
    <span class="tile-no">${esc(code)}</span>
    <strong>${esc(level.name)}</strong>
    <span class="pips" aria-label="${count} of 3 medals">
      ${medalGlyph('reach', level.reach)}${medalGlyph('lean', level.lean)}${medalGlyph('swift', level.swift)}
    </span>
  </button></li>`;
}

function renderNotes(vm: ViewModel): string {
  const groups = new Map<string, NoteCard[]>();
  for (const note of vm.notes) {
    const list = groups.get(note.category) ?? [];
    list.push(note);
    groups.set(note.category, list);
  }
  const body = [...groups.entries()]
    .map(
      ([category, notes]) => `<section class="note-group">
        <h2>${esc(category)}</h2>
        <div class="note-grid">
        ${notes
          .map(
            (note, i) => `<article class="card note" style="--i:${i}" data-enter="note:${esc(note.kind)}">
              <span class="note-icon" aria-hidden="true">${pieceIcon(note.kind)}</span>
              <div><h3>${esc(note.name)}</h3><p>${esc(note.blurb)}</p></div>
            </article>`,
          )
          .join('')}
        </div>
      </section>`,
    )
    .join('');
  return `<main class="screen sheet">
    <header class="sheet-head">
      <button class="text" type="button" data-act="map">${icon('back')} Back</button>
      <p class="kicker">Field notes</p>
      <h1>What you can build</h1>
      <p class="lede">Mechanics appear here after the campaign opens them.</p>
    </header>
    ${body || '<p>Place a ramp in the first puzzle. The notes will grow from there.</p>'}
  </main>`;
}

function renderSettings(vm: ViewModel): string {
  const settings = vm.settings;
  return `<main class="screen sheet">
    <header class="sheet-head">
      <button class="text" type="button" data-act="map">${icon('back')} Back</button>
      <p class="kicker">Settings</p>
      <h1>On this device</h1>
      <p class="lede">Progress stays here. Nothing is sent.</p>
    </header>
    <section class="card settings-card">
      <h2>Sound</h2>
      <label class="slider"><span>Music</span>
        <input type="range" min="0" max="1" step="0.05" data-setting="music" value="${settings.music}" />
        <span data-for="music">${Math.round(settings.music * 100)}%</span>
      </label>
      <label class="slider"><span>Effects</span>
        <input type="range" min="0" max="1" step="0.05" data-setting="sfx" value="${settings.sfx}" />
        <span data-for="sfx">${Math.round(settings.sfx * 100)}%</span>
      </label>
    </section>
    <section class="card settings-card">
      <h2>Comfort</h2>
      <label class="check"><input type="checkbox" data-setting="haptics" ${settings.haptics ? 'checked' : ''} /> Haptics</label>
      <label class="check"><input type="checkbox" data-setting="reducedMotion" ${settings.reducedMotion ? 'checked' : ''} /> Reduced motion</label>
      <label class="check"><input type="checkbox" data-setting="highContrast" ${settings.highContrast ? 'checked' : ''} /> High contrast</label>
      <div class="row" role="group" aria-label="Text size">
        ${[1, 1.15, 1.3].map((scale) => `<button class="ghost" type="button" data-act="scale:${scale}" aria-pressed="${settings.uiScale === scale}">${scale === 1 ? 'A' : scale === 1.15 ? 'A+' : 'A++'}</button>`).join('')}
      </div>
    </section>
    <section class="card settings-card">
      <h2>Progress</h2>
      <p class="muted">Your record and feats are in the <button class="text" type="button" data-act="log">logbook</button>.</p>
      ${
        vm.confirm === 'reset'
          ? '<button class="ghost danger" type="button" data-act="reset-yes">Erase progress on this device</button>'
          : '<button class="ghost" type="button" data-act="reset">Reset progress</button>'
      }
    </section>
    <details class="keys card">
      <summary>Keys</summary>
      <p>Space launches. Q and E rotate. Arrows nudge a selected piece, or pan the board. Ctrl+Z undoes. G cycles the grid. P pauses. H frames the level. 1–9 pick a piece.</p>
    </details>
  </main>`;
}

function renderLog(vm: ViewModel): string {
  const log = vm.log;
  const share = vm.medalMax > 0 ? Math.round((vm.medalTotal / vm.medalMax) * 100) : 0;
  return `<main class="screen sheet">
    <header class="sheet-head">
      <button class="text" type="button" data-act="map">${icon('back')} Back</button>
      <p class="kicker">Logbook</p>
      <h1>Your record</h1>
      <p class="lede">Medals mark how cleanly you build. Feats mark how you play.</p>
    </header>
    <section class="rank-card card" data-enter="log-rank">
      <span class="rank-badge" aria-hidden="true">${medalGlyph('reach', true)}</span>
      <div class="rank-text">
        <strong>${esc(vm.rank)}</strong>
        <span>${vm.medalTotal} of ${vm.medalMax} medals · ${esc(vm.nextRank)}</span>
      </div>
      <div class="meter" role="img" aria-label="${share}% of medals"><span style="--fill:${share}%"></span></div>
    </section>
    <section class="card settings-card">
      <h2>Record</h2>
      <div class="stat-row wide">
        ${log.stats.map((stat) => `<div class="stat"><strong>${esc(stat.value)}</strong><span>${esc(stat.label)}</span></div>`).join('')}
      </div>
    </section>
    <section class="feat-group">
      <div class="row spread"><h2>Feats</h2><span class="muted">${log.earned} of ${log.feats.length}</span></div>
      <ol class="feat-grid">
        ${log.feats.map(featCard).join('')}
      </ol>
    </section>
  </main>`;
}

function featCard(feat: FeatCard, index: number): string {
  const share = feat.need > 0 ? Math.round((feat.have / feat.need) * 100) : 0;
  const status = feat.done ? `Earned ${feat.when}` : `${feat.have} of ${feat.need}`;
  return `<li class="card feat${feat.done ? ' earned' : ''}" style="--i:${index}" data-enter="feat:${esc(feat.id)}:${feat.done}">
    <span class="feat-mark" aria-hidden="true">${icon(feat.done ? 'star' : 'lock')}</span>
    <div class="feat-text">
      <h3>${esc(feat.name)}</h3>
      <p>${esc(feat.blurb)}</p>
      ${feat.reward ? `<p class="feat-reward">Opens the ${esc(feat.reward)} ball finish.</p>` : ''}
      ${feat.need > 1 && !feat.done ? `<div class="meter" role="img" aria-label="${esc(status)}"><span style="--fill:${share}%"></span></div>` : ''}
      <small>${esc(status)}</small>
    </div>
  </li>`;
}

function streakLine(streak: number, best: number): string {
  if (streak > 1) {
    const record = best > streak ? ` · best ${best}` : ' · your best';
    return `<p class="streak">${icon('spark')} ${streak}-day streak${record}</p>`;
  }
  if (best > 1) return `<p class="streak quiet">${icon('spark')} Best streak: ${best} days</p>`;
  return '';
}

function chaseCard(rows: ChaseRow[]): string {
  if (rows.length === 0) return '';
  return `<section class="card chase" data-enter="chase">
    <div>
      <p class="kicker">Within reach</p>
      <p class="muted">Your best builds came close on these.</p>
    </div>
    <ul>
      ${rows
        .map(
          (row, i) => `<li style="--i:${i}"><button class="chase-row" type="button" data-act="level:${esc(row.id)}">
            ${medalGlyph(row.medal, false)}
            <span class="chase-code">${esc(row.code)}</span>
            <strong>${esc(row.name)}</strong>
            <small>${esc(row.note)}</small>
            ${icon('arrow')}
          </button></li>`,
        )
        .join('')}
    </ul>
  </section>`;
}

function renderPlay(vm: ViewModel): string {
  const play = vm.play;
  if (!play) return '';
  const coach = play.guide || play.lesson;
  return `<div class="play${play.mode === 'run' ? ' running' : ''}">
    <header class="bar">
      <button class="icon back" type="button" data-act="back" aria-label="Back to campaign" title="Back to campaign">${icon('back')}</button>
      <div class="titles card" data-enter="titles:${play.visit}">
        <p class="kicker">${play.code ? `<span class="code">${esc(play.code)}</span>` : ''}${esc(play.kicker)}</p>
        <div class="row spread tight">
          ${
            play.sandbox
              ? `<label class="name-line"><span class="sr">Name</span><input data-act="name" maxlength="48" value="${esc(play.title)}" autocomplete="off" /></label>`
              : `<h1>${esc(play.title)}</h1>`
          }
          <p class="meta">${
            play.mode === 'run'
              ? `${icon('clock')}<span data-bind="clock">${esc(vm.clock)}</span>`
              : `${icon('launch')}<span>${play.attempts}</span><span class="sr"> launch${play.attempts === 1 ? '' : 'es'}</span>`
          }</p>
        </div>
        <p class="summary">${esc(play.summary)}</p>
        ${play.sandbox ? workshopActions(play) : ''}
        ${coach ? `<p class="coach" data-enter="coach:${esc(coach)}">${icon('spark')}<span>${esc(coach)}</span></p>` : ''}
      </div>
      ${play.sandbox ? '' : goalsPanel(play)}
    </header>
    ${play.outcome === 'won' ? result(play) : ''}
    ${!play.sandbox && play.visit > 0 ? intro(play) : ''}
    <footer class="dock">
      ${banner(play)}
      <div class="tray" role="listbox" aria-label="Pieces" data-enter="tray:${play.visit}">
        ${play.chips
          .map(
            (chip, i) => `<button class="chip${chip.selected ? ' selected' : ''}${chip.empty ? ' empty' : ''}" type="button" role="option" aria-selected="${chip.selected}" data-act="tool:${chip.index}" title="${esc(chip.label)} · ${esc(chip.meta)} · key ${i + 1}">
              <span class="chip-icon" aria-hidden="true">${pieceIcon(chip.kind)}</span>
              <span class="chip-text"><strong>${esc(chip.label)}</strong><small>${esc(chip.meta)}</small></span>
              <span class="count" aria-hidden="true">${Math.max(0, chip.left)}</span>
            </button>`,
          )
          .join('')}
      </div>
      <div class="tool-row">
        <div class="toolbar card" data-enter="toolbar:${play.visit}">${tools(play)}</div>
        <button data-enter="launch:${play.visit}" class="launch${play.mode === 'run' ? ' again' : ''}" type="button" data-act="${play.mode === 'build' ? 'launch' : 'restart'}" aria-keyshortcuts="Space">
          <span class="launch-glow" aria-hidden="true"></span>
          <span class="launch-ring" aria-hidden="true"></span>
          ${icon(play.mode === 'build' ? 'play' : 'replay')}
          <span>${play.mode === 'build' ? 'Launch' : 'Again'}</span>
        </button>
      </div>
    </footer>
  </div>`;
}

function goalsPanel(play: PlayView): string {
  const seconds = play.targets.seconds.toFixed(1);
  const pieces = play.targets.pieces;
  return `<div class="goals card" aria-label="Medals" data-enter="goals:${play.visit}">
    ${goalMedal('reach', 'Reach', 'Land in the ring', play.saved.reach, play.now.reach)}
    ${goalMedal('lean', 'Lean', `${pieces} piece${pieces === 1 ? '' : 's'} or fewer`, play.saved.lean, play.now.lean)}
    ${goalMedal('swift', 'Swift', `${seconds}s or faster`, play.saved.swift, play.now.swift)}
    ${play.best ? `<p class="best">${esc(play.best)}</p>` : ''}
  </div>`;
}

function goalMedal(kind: 'reach' | 'lean' | 'swift', name: string, rule: string, saved: boolean, now: boolean): string {
  const on = saved || now;
  return `<div class="goal${on ? ' on' : ''}" title="${esc(name)}: ${esc(rule)}"${now && !saved ? ` data-enter="goal-now:${kind}"` : ''}>
    ${medalGlyph(kind, on)}
    <span><strong>${name}</strong><small>${esc(rule)}</small></span>
    <span class="sr">${on ? 'earned' : 'open'}</span>
  </div>`;
}

function workshopActions(play: PlayView): string {
  const options = play.drafts
    .map((draft) => `<option value="${esc(draft.id)}">${esc(draft.name)}</option>`)
    .join('');
  return `<div class="row workshop-row">
      <button class="ghost small" type="button" data-act="validate">${icon('check')}<span>Check</span></button>
      <button class="ghost small" type="button" data-act="save-draft">${icon('save')}<span>Save</span></button>
      <button class="ghost small" type="button" data-act="export">${icon('export')}<span>Export</span></button>
      <button class="ghost small" type="button" data-act="import">${icon('import')}<span>Import</span></button>
      <button class="ghost small" type="button" data-act="new-bench">${icon('plus')}<span>New</span></button>
      ${options ? `<label class="sr" for="drafts">Drafts</label><select id="drafts" data-draft="1"><option value="">Saved benches</option>${options}</select>` : ''}
    </div>
    <input id="level-file" type="file" accept="application/json,.json" hidden />
    ${play.issues ? `<p class="issues">${esc(play.issues)}</p>` : ''}`;
}

function tool(
  act: string,
  iconName: string,
  label: string,
  options: { disabled?: boolean; pressed?: boolean; keys?: string; danger?: boolean; nudge?: boolean } = {},
): string {
  const pressed = options.pressed === undefined ? '' : ` aria-pressed="${options.pressed}"`;
  const keys = options.keys ? ` aria-keyshortcuts="${options.keys}"` : '';
  return `<button class="tb${options.danger ? ' danger' : ''}${options.nudge ? ' nudge' : ''}" type="button" data-act="${act}" title="${esc(label)}"${pressed}${keys}${options.disabled ? ' disabled' : ''}>${icon(iconName)}<span>${esc(label)}</span></button>`;
}

function tools(play: PlayView): string {
  if (play.mode === 'run') {
    return `<div class="group">
        ${tool('pause', play.paused ? 'play' : 'pause', play.paused ? 'Resume' : 'Pause', { keys: 'P', disabled: play.outcome !== null })}
        ${tool('step', 'step', 'Step', { keys: '.', disabled: play.outcome !== null })}
        ${tool('edit', 'stop', 'Edit', { keys: 'Escape' })}
      </div>
      <div class="group">
        ${tool('follow', 'target', 'Follow', { pressed: play.follow, keys: 'F' })}
      </div>
      <div class="group speed" role="group" aria-label="Speed">
        ${[0.25, 0.5, 1, 2]
          .map((value) => {
            const label = value === 0.25 ? '¼×' : value === 0.5 ? '½×' : value === 1 ? '1×' : '2×';
            return `<button class="seg" type="button" data-act="speed:${value}" aria-pressed="${play.speed === value}">${label}</button>`;
          })
          .join('')}
      </div>`;
  }
  const extra = play.hasSelection
    ? `<div class="group nudge" aria-label="Nudge selected piece">
        <button class="tb" type="button" data-act="nudge-l" aria-label="Nudge left" title="Nudge left">${icon('left')}</button>
        <button class="tb" type="button" data-act="nudge-u" aria-label="Nudge up" title="Nudge up">${icon('up')}</button>
        <button class="tb" type="button" data-act="nudge-d" aria-label="Nudge down" title="Nudge down">${icon('down')}</button>
        <button class="tb" type="button" data-act="nudge-r" aria-label="Nudge right" title="Nudge right">${icon('right')}</button>
        ${play.canReplace ? tool('replace', 'swap', 'Replace') : ''}
        ${play.canLink ? tool('link', 'link', 'Link') : ''}
      </div>`
    : '';
  return `<div class="group">
      ${tool('undo', 'undo', 'Undo', { disabled: !play.canUndo, keys: 'Control+Z' })}
      ${tool('redo', 'redo', 'Redo', { disabled: !play.canRedo, keys: 'Control+Y' })}
    </div>
    <div class="group">
      ${tool('rot-left', 'rotl', 'Turn', { keys: 'Q' })}
      ${tool('rot-right', 'rotr', 'Turn', { keys: 'E' })}
      ${tool('duplicate', 'copy', 'Copy', { disabled: !play.hasSelection, keys: 'Control+D' })}
      ${tool('delete', 'trash', 'Delete', { disabled: !play.hasSelection, keys: 'Delete' })}
    </div>
    ${extra}
    <div class="group">
      ${tool('snap', 'grid', `Grid ${play.snapLabel}`, { keys: 'G' })}
      ${tool('hint', 'bulb', play.hintStep, { nudge: play.nudgeHint })}
      ${tool('frame', 'frame', 'Frame', { keys: 'H' })}
      ${play.hasGhost ? tool('ghost', 'ghost', 'Last run', { pressed: play.showGhost }) : ''}
      ${
        play.confirm === 'clear'
          ? tool('clear-yes', 'trash', 'Sure?', { danger: true })
          : tool('clear', 'clear', 'Clear', { disabled: play.stats.pieces === 0 })
      }
    </div>`;
}

function banner(play: PlayView): string {
  if (play.outcome === 'won') return '';
  const bits: string[] = [];
  if (play.toast) {
    const lost = play.outcome === 'lost';
    bits.push(
      `<p class="toast${lost ? ' fail' : ''}">${lost ? `<span class="toast-icon" aria-hidden="true">${icon('miss')}</span>` : ''}<span>${esc(play.toast)}</span></p>`,
    );
  }
  if (play.hint) bits.push(`<p class="hint"><span class="hint-tag">${icon('bulb')}${esc(play.hintStep)}</span> ${esc(play.hint)}</p>`);
  if (play.nudgeHint && (play.mode === 'build' || play.outcome === 'lost')) {
    bits.push(`<button class="ghost small offer" type="button" data-act="hint">${icon('bulb')}<span>${play.hint ? 'Another hint' : 'Want a hint?'}</span></button>`);
  }
  if (play.showSkip) {
    bits.push(
      play.confirm === 'skip'
        ? '<button class="ghost" type="button" data-act="skip-yes">Pass for now. It stays open, and the next puzzle opens.</button>'
        : '<button class="text" type="button" data-act="skip">Pass on this one for now</button>',
    );
  }
  if (bits.length === 0) return '';
  const token = `banner:${play.outcome ?? 'none'}:${play.attempts}:${play.toast}:${play.hintStep}:${play.nudgeHint}`;
  return `<section class="banner card${play.outcome === 'lost' ? ' lost' : ''}" role="status" data-enter="${esc(token)}">${bits.join('')}</section>`;
}

function result(play: PlayView): string {
  const medals: ['reach' | 'lean' | 'swift', string, boolean][] = [
    ['reach', 'Reach', play.now.reach],
    ['lean', 'Lean', play.now.lean],
    ['swift', 'Swift', play.now.swift],
  ];
  const earned = medals.filter(([, , on]) => on).length;
  const heading = earned === 3 ? 'Flawless.' : earned === 2 ? 'Clean build.' : 'The ring holds.';
  return `<div class="result-veil" data-enter="veil">
    <div class="sunburst" aria-hidden="true"></div>
    <section class="result card${earned === 3 ? ' flawless' : ''}" role="dialog" aria-labelledby="result-title" data-enter="result">
      <p class="kicker">${esc(play.code ? `${play.code} · Solved` : 'Solved')}</p>
      <h2 id="result-title">${heading}</h2>
      <div class="stamps">
        ${medals
          .map(
            ([kind, name, on], i) => `<div class="stamp${on ? ' on' : ''}" style="--i:${i}">
              ${medalGlyph(kind, on)}
              <span>${name}</span>
            </div>`,
          )
          .join('')}
      </div>
      <div class="stat-row">
        <div class="stat"><strong>${esc(play.stats.time)}</strong><span>time</span></div>
        <div class="stat"><strong>${play.stats.pieces}</strong><span>piece${play.stats.pieces === 1 ? '' : 's'}</span></div>
        <div class="stat"><strong>${play.stats.launches}</strong><span>launch${play.stats.launches === 1 ? '' : 'es'}</span></div>
      </div>
      <p class="note">${esc(play.medalNote)}</p>
      ${
        play.rewards.length
          ? `<ul class="rewards">${play.rewards.map((line, i) => `<li style="--i:${i}">${icon('star')}<span>${esc(line)}</span></li>`).join('')}</ul>`
          : ''
      }
      <div class="row">
        ${
          play.nextName
            ? `<button class="primary big" type="button" data-act="next"><span>Next · ${esc(play.nextName)}</span>${icon('arrow')}</button>`
            : '<button class="primary big" type="button" data-act="back"><span>Back to the map</span>' + icon('arrow') + '</button>'
        }
        <button class="ghost" type="button" data-act="restart">${icon('replay')}<span>Replay</span></button>
        <button class="ghost" type="button" data-act="edit">${icon('wrench')}<span>Keep tinkering</span></button>
      </div>
    </section>
  </div>`;
}

function introduces(world: WorldCard): string {
  if (world.introduces.length === 0) return '';
  return `<p class="brings"><span class="kicker">Brings</span>${world.introduces.map((name) => `<span class="brings-chip">${esc(name)}</span>`).join('')}</p>`;
}

function finishRow(finishes: FinishChip[]): string {
  return `<div class="finishes" role="group" aria-label="Ball finish">
    <span class="kicker">Ball</span>
    ${finishes
      .map((finish) => {
        return `<button class="finish${finish.selected ? ' on' : ''}" type="button" style="--band:${esc(finish.band)}; --body:${esc(finish.body)}" data-act="finish:${esc(finish.id)}" aria-pressed="${finish.selected}" aria-label="${esc(finish.label)}" title="${esc(finish.label)}"${finish.open ? '' : ' disabled'}>
          <span class="swatch" aria-hidden="true"></span>${finish.open ? '' : `<small>${esc(finish.tag)}</small>`}
        </button>`;
      })
      .join('')}
  </div>`;
}

function intro(play: PlayView): string {
  return `<div class="intro" aria-hidden="true" data-enter="intro:${play.visit}">
    <p class="intro-code">${esc(play.code)}</p>
    <h2>${esc(play.title)}</h2>
    <span class="intro-rule"></span>
    <p>${esc(play.summary)}</p>
  </div>`;
}

/** The title emblem: a ball rolls off a ramp, arcs along its dotted path, and drops into the ring. */
function emblem(): string {
  const flight = 'M18 27 L60 35.5 C92 42 118 22 146 42 C162 54 174 62 184 62';
  return `<div class="emblem" aria-hidden="true">
    <svg viewBox="0 0 220 110">
      <path class="em-grid" d="M0 20 H220 M0 50 H220 M0 80 H220 M40 0 V110 M90 0 V110 M140 0 V110 M190 0 V110"/>
      <path class="em-path" d="${flight}"/>
      <path class="em-ramp" d="M10 34 L66 45.5"/>
      <path class="em-ramp" d="M108 84 L168 96"/>
      <circle class="em-glow" cx="184" cy="62" r="30"/>
      <circle class="em-ring" cx="184" cy="62" r="21"/>
      <circle class="em-ring inner" cx="184" cy="62" r="13"/>
      <path class="em-gem" d="M184 56 L188.5 62 L184 68 L179.5 62 Z"/>
    </svg>
    <span class="em-ball" style="offset-path: path('${flight}')"></span>
  </div>`;
}

function medalGlyph(kind: 'reach' | 'lean' | 'swift', on: boolean): string {
  const shapes = {
    reach: '<circle cx="12" cy="12" r="5"/>',
    lean: '<path d="M12 5.5 L17.5 12 L12 18.5 L6.5 12 Z"/>',
    swift: '<path d="M13 4.5 L7.5 13 H11.5 L10.5 19.5 L16.5 11 H12.5 Z"/>',
  };
  return `<span class="medal ${kind}${on ? ' on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${shapes[kind]}</svg></span>`;
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    back: '<path d="M15 6 L9 12 L15 18"/>',
    arrow: '<path d="M5 12 H19"/><path d="M13 6 L19 12 L13 18"/>',
    gear: '<path d="M4 8 H9"/><path d="M15 8 H20"/><circle cx="12" cy="8" r="2.2"/><path d="M4 16 H7"/><path d="M13 16 H20"/><circle cx="10" cy="16" r="2.2"/>',
    undo: '<path d="M9 14 L4 9 L9 4"/><path d="M4 9 H14 A6 6 0 0 1 14 21 H10"/>',
    redo: '<path d="M15 14 L20 9 L15 4"/><path d="M20 9 H10 A6 6 0 0 0 10 21 H14"/>',
    rotl: '<path d="M4 4 V9 H9"/><path d="M4.6 9 A8 8 0 1 1 6 16.5"/>',
    rotr: '<path d="M20 4 V9 H15"/><path d="M19.4 9 A8 8 0 1 0 18 16.5"/>',
    left: '<path d="M14 7 L9 12 L14 17"/>',
    right: '<path d="M10 7 L15 12 L10 17"/>',
    up: '<path d="M7 14 L12 9 L17 14"/>',
    down: '<path d="M7 10 L12 15 L17 10"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15 V7 A2 2 0 0 1 7 5 H15"/>',
    trash: '<path d="M5 7 H19"/><path d="M10 4 H14"/><path d="M7 7 L8 20 H16 L17 7"/><path d="M10.5 11 V16"/><path d="M13.5 11 V16"/>',
    clear: '<path d="M4 20 H20"/><path d="M14 4 L20 10 L12 18 H8 L5 15 Z"/><path d="M9 9 L15 15"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12 H20"/><path d="M12 4 V20"/>',
    bulb: '<path d="M9 17 H15"/><path d="M10 20.5 H14"/><path d="M8.5 14 A6 6 0 1 1 15.5 14 C14.6 14.8 14.5 15.5 14.5 17 H9.5 C9.5 15.5 9.4 14.8 8.5 14 Z"/>',
    frame: '<path d="M4 9 V4 H9"/><path d="M15 4 H20 V9"/><path d="M20 15 V20 H15"/><path d="M9 20 H4 V15"/>',
    ghost: '<path d="M4 18 C8 18 8 8 12 8 C16 8 16 14 20 14" stroke-dasharray="2.5 2.5"/><circle cx="20" cy="14" r="1.6"/>',
    play: '<path d="M8 5.5 L19 12 L8 18.5 Z" fill="currentColor"/>',
    pause: '<path d="M9 5 V19"/><path d="M15 5 V19"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    step: '<path d="M6 6 L14 12 L6 18 Z"/><path d="M18 6 V18"/>',
    replay: '<path d="M4 12 A8 8 0 1 0 7 5.8"/><path d="M4 4 V9 H9"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2 V5"/><path d="M12 19 V22"/><path d="M2 12 H5"/><path d="M19 12 H22"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5 V12 L15 14"/>',
    launch: '<path d="M5 19 C9 15 11 9 19 5"/><circle cx="19" cy="5" r="1.8"/><path d="M4 21 H9"/>',
    spark: '<path d="M12 3 V7"/><path d="M12 17 V21"/><path d="M3 12 H7"/><path d="M17 12 H21"/><path d="M6 6 L8.5 8.5"/><path d="M15.5 15.5 L18 18"/><path d="M18 6 L15.5 8.5"/><path d="M8.5 15.5 L6 18"/>',
    swap: '<path d="M5 8 H19"/><path d="M15 4 L19 8 L15 12"/><path d="M19 16 H5"/><path d="M9 12 L5 16 L9 20"/>',
    link: '<path d="M10 14 L14 10"/><path d="M8.5 11.5 L6.5 13.5 A3.5 3.5 0 0 0 11.5 18.5 L13.5 16.5"/><path d="M15.5 12.5 L17.5 10.5 A3.5 3.5 0 0 0 12.5 5.5 L10.5 7.5"/>',
    miss: '<circle cx="12" cy="12" r="8"/><path d="M9 9 L15 15"/><path d="M15 9 L9 15"/>',
    check: '<path d="M5 12.5 L10 17 L19 7"/>',
    save: '<path d="M5 5 H16 L19 8 V19 H5 Z"/><path d="M8 5 V10 H15 V5"/><path d="M8 19 V14 H16 V19"/>',
    export: '<path d="M12 15 V3"/><path d="M7 8 L12 3 L17 8"/><path d="M5 14 V20 H19 V14"/>',
    import: '<path d="M12 3 V15"/><path d="M7 10 L12 15 L17 10"/><path d="M5 14 V20 H19 V14"/>',
    plus: '<path d="M12 5 V19"/><path d="M5 12 H19"/>',
    map: '<path d="M4 6 L9 4 L15 6 L20 4 V18 L15 20 L9 18 L4 20 Z"/><path d="M9 4 V18"/><path d="M15 6 V20"/>',
    wrench: '<path d="M14.5 5.5 A4 4 0 0 0 19 10.5 L20 9.5 A5.5 5.5 0 0 1 13 4 Z"/><path d="M14 10 L5 19"/><path d="M13 4 L14.5 5.5"/>',
    book: '<path d="M5 5 A2 2 0 0 1 7 3 H19 V17 H7 A2 2 0 0 0 5 19 Z"/><path d="M5 19 A2 2 0 0 0 7 21 H19 V17"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10 H20"/><path d="M8.5 3.5 V7"/><path d="M15.5 3.5 V7"/><path d="M8 14 H10"/><path d="M14 14 H16"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5 V8 A3.5 3.5 0 0 1 15.5 8 V10.5"/>',
    trophy: '<path d="M8 4 H16 V10 A4 4 0 0 1 8 10 Z"/><path d="M8 6 H5 A3 3 0 0 0 8 11"/><path d="M16 6 H19 A3 3 0 0 1 16 11"/><path d="M12 14 V17"/><path d="M8.5 20 H15.5 L14.5 17 H9.5 Z"/>',
    star: '<path d="M12 4 L14.3 9 L19.6 9.5 L15.6 13 L16.8 18.3 L12 15.5 L7.2 18.3 L8.4 13 L4.4 9.5 L9.7 9 Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

/** A small glyph for each piece kind, drawn to match the board art. */
export function pieceIcon(kind: string): string {
  const art: Record<string, string> = {
    platform: '<rect x="3" y="12" width="18" height="4" rx="1" class="wood"/><path d="M6 14 H18" class="grain"/>',
    ramp: '<path d="M3.6 8.2 L20.4 14.8 L19.6 17.2 L2.8 10.6 Z" class="wood"/>',
    wall: '<rect x="10" y="3" width="4" height="18" rx="1" class="steel"/>',
    spring: '<rect x="3" y="7" width="2.5" height="10" rx="0.6" class="wood"/><path d="M5.5 12 L7 8 L9 16 L11 8 L13 16 L15 8 L16.5 12" class="coil"/><rect x="16.5" y="8" width="2" height="8" rx="0.5" class="hot"/><path d="M19.5 9.5 L22 12 L19.5 14.5 Z" class="hotfill"/>',
    bouncer: '<rect x="3" y="12" width="18" height="6" rx="1.4" class="dark"/><rect x="4.5" y="11" width="15" height="2" rx="1" class="hotfill"/><path d="M8 8 L12 4.5 L16 8" class="coil"/>',
    accelerator: '<rect x="2.5" y="6" width="19" height="12" rx="2.5" class="fieldhot"/><path d="M6 9 L9 12 L6 15"/><path d="M11 9 L14 12 L11 15"/><path d="M16 9 L19 12 L16 15"/>',
    conveyor: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" class="dark"/><circle cx="6" cy="12" r="1.6" class="light"/><circle cx="18" cy="12" r="1.6" class="light"/><path d="M10 12 H14.5"/><path d="M13 10.5 L14.5 12 L13 13.5"/>',
    gravity: '<rect x="3" y="3" width="18" height="18" rx="3" class="fieldviolet"/><path d="M12 7 V16"/><path d="M8.5 13 L12 16.5 L15.5 13"/>',
    portal: '<ellipse cx="12" cy="12" rx="5.5" ry="8.5" class="portal"/><ellipse cx="12" cy="12" rx="2.4" ry="4.6" class="portal-in"/>',
    cannon: '<rect x="4" y="8" width="13" height="7" rx="2" class="steel"/><circle cx="8" cy="17" r="3" class="wood"/><path d="M18.5 9.5 L22 11.5 L18.5 13.5 Z" class="hotfill"/>',
    switch: '<rect x="3" y="14" width="18" height="4" rx="1" class="steel"/><circle cx="12" cy="11.5" r="3.5" class="hotfill"/>',
    door: '<rect x="8" y="3" width="8" height="18" rx="1" class="steel"/><path d="M10 8 H14"/><path d="M10 12 H14"/><path d="M10 16 H14"/>',
    mover: '<rect x="4" y="10" width="16" height="4" rx="1" class="wood"/><path d="M2 12 L4.5 9.5"/><path d="M2 12 L4.5 14.5"/><path d="M22 12 L19.5 9.5"/><path d="M22 12 L19.5 14.5"/>',
    spinner: '<rect x="2.5" y="10" width="19" height="4" rx="1" class="wood"/><circle cx="12" cy="12" r="3" class="darkwood"/><path d="M17 5 A7 7 0 0 1 19.5 9" class="coil"/>',
    breakable: '<rect x="3" y="10" width="18" height="5" rx="1" class="glass"/><path d="M9 15 L11 12.5 L13 13.5 L15 10"/>',
    oneway: '<rect x="3" y="14" width="18" height="4" rx="1" class="wood"/><path d="M8 11 L12 7 L16 11"/>',
  };
  return `<svg class="piece-icon" viewBox="0 0 24 24" aria-hidden="true">${art[kind] ?? art.platform}</svg>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}
