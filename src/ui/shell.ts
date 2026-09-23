export interface MedalBits {
  reach: boolean;
  lean: boolean;
  swift: boolean;
}

export interface ChipView {
  index: number;
  label: string;
  meta: string;
  selected: boolean;
  empty: boolean;
}

export interface LevelNode {
  id: string;
  name: string;
  summary: string;
  open: boolean;
  secret: boolean;
  reach: boolean;
  lean: boolean;
  swift: boolean;
  current: boolean;
}

export interface WorldCard {
  id: string;
  kicker: string;
  name: string;
  lesson: string;
  accent: string;
  open: boolean;
  levels: LevelNode[];
}

export interface NoteCard {
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
  confirm: '' | 'skip' | 'clear' | 'reset';
  nextName: string | null;
  secretNote: string;
  follow: boolean;
  showGhost: boolean;
  hasGhost: boolean;
  issues: string;
  drafts: DraftRow[];
}

export interface ViewModel {
  key: string;
  screen: 'title' | 'map' | 'play' | 'workshop' | 'notes' | 'settings';
  clock: string;
  hasProgress: boolean;
  rank: string;
  medalTotal: number;
  worlds: WorldCard[];
  daily: { name: string; blurb: string; open: boolean; done: boolean };
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
    launches: number;
    solves: number;
    hints: number;
  };
}

export class Shell {
  private key = '';

  constructor(private root: HTMLElement) {}

  sync(vm: ViewModel): void {
    if (vm.key !== this.key) {
      const previous = this.key;
      this.key = vm.key;
      this.root.innerHTML = render(vm);
      if (vm.play?.outcome === 'won' && !previous.includes('|won|')) {
        const next = this.root.querySelector('.banner .primary');
        if (next instanceof HTMLElement) next.focus();
      }
    }
    const clock = this.root.querySelector('[data-bind="clock"]');
    if (clock) clock.textContent = vm.clock;
  }
}

function render(vm: ViewModel): string {
  if (vm.screen === 'title') return renderTitle(vm);
  if (vm.screen === 'map') return renderMap(vm);
  if (vm.screen === 'notes') return renderNotes(vm);
  if (vm.screen === 'settings') return renderSettings(vm);
  return renderPlay(vm);
}

function renderTitle(vm: ViewModel): string {
  return `<div class="title-wrap">
    <section class="title-card">
      <div class="mark" aria-hidden="true"><span class="spinner"><span class="ball"></span></span><span class="ring"></span><span class="ring inner"></span></div>
      <p class="kicker">Physics puzzle</p>
      <h1>Bounce Architect</h1>
      <p class="lede">You don’t control the ball. You engineer the world around it.</p>
      <div class="row">
        <button class="primary" type="button" data-act="begin">${vm.hasProgress ? 'Continue' : 'Begin'}</button>
        <button class="ghost" type="button" data-act="map">Campaign</button>
      </div>
      <div class="row quiet">
        <button class="text" type="button" data-act="workshop">Workshop</button>
        <button class="text" type="button" data-act="notes">Field notes</button>
        <button class="text" type="button" data-act="settings">Settings</button>
      </div>
    </section>
  </div>`;
}

function renderMap(vm: ViewModel): string {
  return `<main class="screen map">
    <header class="sheet-head">
      <div class="row spread">
        <button class="text" type="button" data-act="title">Title</button>
        <button class="icon" type="button" data-act="settings" aria-label="Settings">${icon('gear')}</button>
      </div>
      <p class="kicker">Campaign</p>
      <h1>The board</h1>
      <p class="lede">${esc(vm.rank)} · ${vm.medalTotal} medal${vm.medalTotal === 1 ? '' : 's'}</p>
      <div class="row">
        <button class="primary" type="button" data-act="continue">Continue</button>
        <button class="ghost" type="button" data-act="workshop">Workshop</button>
        <button class="ghost" type="button" data-act="notes">Field notes</button>
      </div>
    </header>
    <section class="card daily">
      <p class="kicker">Daily blueprint</p>
      <h2>${esc(vm.daily.name)}</h2>
      <p>${esc(vm.daily.blurb)}</p>
      ${vm.daily.done ? '<p class="done">Done today.</p>' : ''}
      ${vm.daily.open ? '<button class="primary" type="button" data-act="daily">Play today’s blueprint</button>' : ''}
    </section>
    ${vm.worlds.map(renderWorld).join('')}
  </main>`;
}

function renderWorld(world: WorldCard): string {
  if (!world.open) {
    return `<section class="world locked" style="--world:${esc(world.accent)}">
      <p class="kicker">${esc(world.kicker)}</p>
      <h2>${esc(world.name)}</h2>
      <p class="muted">Still ahead.</p>
    </section>`;
  }
  return `<section class="world" style="--world:${esc(world.accent)}">
    <p class="kicker">${esc(world.kicker)}</p>
    <h2>${esc(world.name)}</h2>
    <p>${esc(world.lesson)}</p>
    <ol class="path">
      ${world.levels.map(renderNode).join('')}
    </ol>
  </section>`;
}

function renderNode(level: LevelNode): string {
  const medals = medalRow(
    { reach: level.reach, lean: level.lean, swift: level.swift },
    { reach: false, lean: false, swift: false },
  );
  if (!level.open) {
    return `<li><button class="node" type="button" disabled>
      <span><strong>${esc(level.name)}</strong><small>Locked</small></span>
    </button></li>`;
  }
  return `<li><button class="node${level.current ? ' current' : ''}${level.secret ? ' secret' : ''}" type="button" data-act="level:${esc(level.id)}">
    <span><strong>${esc(level.name)}</strong><small>${esc(level.summary)}</small></span>
    ${medals}
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
      ([category, notes]) => `<section>
        <h2>${esc(category)}</h2>
        ${notes.map((note) => `<article class="card note"><h3>${esc(note.name)}</h3><p>${esc(note.blurb)}</p></article>`).join('')}
      </section>`,
    )
    .join('');
  return `<main class="screen sheet">
    <header class="sheet-head">
      <button class="text" type="button" data-act="map">Back</button>
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
      <button class="text" type="button" data-act="map">Back</button>
      <p class="kicker">Settings</p>
      <h1>On this device</h1>
      <p class="lede">Progress stays here. Nothing is sent.</p>
    </header>
    <label class="slider">Music
      <input type="range" min="0" max="1" step="0.05" data-setting="music" value="${settings.music}" />
      <span data-for="music">${Math.round(settings.music * 100)}%</span>
    </label>
    <label class="slider">Effects
      <input type="range" min="0" max="1" step="0.05" data-setting="sfx" value="${settings.sfx}" />
      <span data-for="sfx">${Math.round(settings.sfx * 100)}%</span>
    </label>
    <label class="check"><input type="checkbox" data-setting="haptics" ${settings.haptics ? 'checked' : ''} /> Haptics</label>
    <label class="check"><input type="checkbox" data-setting="reducedMotion" ${settings.reducedMotion ? 'checked' : ''} /> Reduced motion</label>
    <label class="check"><input type="checkbox" data-setting="highContrast" ${settings.highContrast ? 'checked' : ''} /> High contrast</label>
    <div class="row" role="group" aria-label="Text size">
      ${[1, 1.15, 1.3].map((scale) => `<button class="ghost" type="button" data-act="scale:${scale}" aria-pressed="${settings.uiScale === scale}">${scale === 1 ? 'A' : scale === 1.15 ? 'A+' : 'A++'}</button>`).join('')}
    </div>
    <p class="muted">${settings.solves} solved · ${settings.launches} launches · ${settings.hints} hints</p>
    ${
      vm.confirm === 'reset'
        ? '<button class="ghost danger" type="button" data-act="reset-yes">Erase progress on this device</button>'
        : '<button class="ghost" type="button" data-act="reset">Reset progress</button>'
    }
    <details class="keys">
      <summary>Keys</summary>
      <p>Space launches. Q and E rotate. Arrows nudge a selected piece, or pan the board. Ctrl+Z undoes. G cycles the grid. P pauses. H frames the level. 1–9 pick a piece.</p>
    </details>
  </main>`;
}

function renderPlay(vm: ViewModel): string {
  const play = vm.play;
  if (!play) return '';
  return `<div class="play">
    <header class="bar">
      <button class="icon" type="button" data-act="back" aria-label="Back to campaign">${icon('back')}</button>
      <div class="titles card">
        <p class="kicker">${esc(play.kicker)}</p>
        <div class="row spread tight">
          ${
            play.sandbox
              ? `<label class="name-line"><span class="sr">Name</span><input data-act="name" maxlength="48" value="${esc(play.title)}" autocomplete="off" /></label>`
              : `<h1>${esc(play.title)}</h1>`
          }
          <p class="meta">${play.mode === 'run' ? `<span data-bind="clock">${esc(vm.clock)}</span>` : `${play.attempts} launch${play.attempts === 1 ? '' : 'es'}`}</p>
        </div>
        <p class="summary">${esc(play.summary)}</p>
        ${play.sandbox ? workshopActions(play) : ''}
        ${play.lesson ? `<p class="lesson">${esc(play.lesson)}</p>` : ''}
        ${play.guide ? `<p class="guide">${esc(play.guide)}</p>` : ''}
      </div>
      ${play.sandbox ? '' : medalRow(play.saved, play.now)}
    </header>
    ${banner(play)}
    <footer class="dock">
      <div class="palette" role="listbox" aria-label="Pieces">
        ${play.chips.map((chip) => `<button class="chip${chip.selected ? ' selected' : ''}${chip.empty ? ' empty' : ''}" type="button" role="option" aria-selected="${chip.selected}" data-act="tool:${chip.index}"><strong>${esc(chip.label)}</strong><small>${esc(chip.meta)}</small></button>`).join('')}
      </div>
      <div class="tool-row">
        <div class="tool-card card">${tools(play)}</div>
        <button class="launch" type="button" data-act="${play.mode === 'build' ? 'launch' : 'restart'}">${play.mode === 'build' ? 'Launch' : 'Relaunch'}</button>
      </div>
    </footer>
  </div>`;
}

function workshopActions(play: PlayView): string {
  const options = play.drafts
    .map((draft) => `<option value="${esc(draft.id)}">${esc(draft.name)}</option>`)
    .join('');
  return `<div class="row">
      <button class="ghost" type="button" data-act="validate">Check</button>
      <button class="ghost" type="button" data-act="save-draft">Save draft</button>
      <button class="ghost" type="button" data-act="export">Export</button>
      <button class="ghost" type="button" data-act="import">Import</button>
      <button class="ghost" type="button" data-act="new-bench">New</button>
      ${options ? `<label class="sr">Drafts</label><select data-draft="1"><option value="">Saved benches</option>${options}</select>` : ''}
    </div>
    <input id="level-file" type="file" accept="application/json,.json" hidden />
    ${play.issues ? `<p>${esc(play.issues)}</p>` : ''}`;
}

function tools(play: PlayView): string {
  if (play.mode === 'run') {
    return `<div class="row">
      <button class="ghost" type="button" data-act="pause">${play.paused ? 'Resume' : 'Pause'}</button>
      <button class="ghost" type="button" data-act="step">Step</button>
      <button class="ghost" type="button" data-act="edit">Edit</button>
      <button class="ghost" type="button" data-act="follow" aria-pressed="${play.follow}">Follow</button>
      ${[0.25, 0.5, 1, 2]
        .map((value) => {
          const label = value === 0.25 ? '¼' : value === 0.5 ? '½' : value === 1 ? '1×' : '2×';
          return `<button class="mini" type="button" data-act="speed:${value}" aria-pressed="${play.speed === value}">${label}</button>`;
        })
        .join('')}
    </div>`;
  }
  return `<div class="row">
      <button class="icon" type="button" data-act="undo" aria-label="Undo" title="Undo" aria-keyshortcuts="Control+Z" ${play.canUndo ? '' : 'disabled'}>${icon('undo')}</button>
      <button class="icon" type="button" data-act="redo" aria-label="Redo" title="Redo" aria-keyshortcuts="Control+Y" ${play.canRedo ? '' : 'disabled'}>${icon('redo')}</button>
      <button class="icon" type="button" data-act="rot-left" aria-label="Rotate left" title="Rotate left">${icon('left')}</button>
      <button class="icon" type="button" data-act="rot-right" aria-label="Rotate right" title="Rotate right">${icon('right')}</button>
      <button class="icon" type="button" data-act="duplicate" aria-label="Duplicate" title="Duplicate" ${play.hasSelection ? '' : 'disabled'}>${icon('copy')}</button>
      <button class="icon" type="button" data-act="delete" aria-label="Delete" title="Delete" ${play.hasSelection ? '' : 'disabled'}>${icon('trash')}</button>
      <button class="ghost" type="button" data-act="snap">Grid ${esc(play.snapLabel)}</button>
      <button class="ghost" type="button" data-act="hint">${esc(play.hintStep)}</button>
      <button class="ghost" type="button" data-act="frame">Frame</button>
      ${play.hasGhost ? `<button class="ghost" type="button" data-act="ghost" aria-pressed="${play.showGhost}">Last run</button>` : ''}
      ${
        play.confirm === 'clear'
          ? '<button class="ghost danger" type="button" data-act="clear-yes">Clear the board</button>'
          : '<button class="ghost" type="button" data-act="clear">Clear</button>'
      }
    </div>
    ${
      play.hasSelection
        ? `<div class="row">
            <div class="nudge" aria-label="Nudge selected piece">
              <button type="button" data-act="nudge-u" aria-label="Nudge up">${icon('up')}</button>
              <button type="button" data-act="nudge-l" aria-label="Nudge left">${icon('left')}</button>
              <button type="button" data-act="nudge-d" aria-label="Nudge down">${icon('down')}</button>
              <button type="button" data-act="nudge-r" aria-label="Nudge right">${icon('right')}</button>
            </div>
            ${play.canReplace ? '<button class="ghost" type="button" data-act="replace">Replace</button>' : ''}
            ${play.canLink ? '<button class="ghost" type="button" data-act="link">Link switch</button>' : ''}
          </div>`
        : ''
    }`;
}

function banner(play: PlayView): string {
  if (play.outcome === 'won') {
    return `<section class="banner card win">
      <h2>The ring holds.</h2>
      <p>${esc(play.medalNote)}</p>
      ${medalRow(play.now, { reach: false, lean: false, swift: false })}
      ${play.secretNote ? `<p>${esc(play.secretNote)}</p>` : ''}
      <div class="row">
        ${
          play.nextName
            ? `<button class="primary" type="button" data-act="next">Next · ${esc(play.nextName)}</button>`
            : '<button class="primary" type="button" data-act="back">Back to the map</button>'
        }
        <button class="ghost" type="button" data-act="edit">Keep tinkering</button>
      </div>
    </section>`;
  }
  const bits: string[] = [];
  if (play.toast) bits.push(`<p${play.outcome === 'lost' ? ' class="fail"' : ''}>${esc(play.toast)}</p>`);
  if (play.hint) bits.push(`<p class="hint"><span>${esc(play.hintStep)}</span> ${esc(play.hint)}</p>`);
  if (play.showSkip) {
    bits.push(
      play.confirm === 'skip'
        ? '<button class="ghost" type="button" data-act="skip-yes">Skip ahead. You can come back for the medals.</button>'
        : '<button class="text" type="button" data-act="skip">Skip this puzzle</button>',
    );
  }
  if (bits.length === 0) return '';
  return `<section class="banner card" role="status">${bits.join('')}</section>`;
}

function medalRow(saved: MedalBits, now: MedalBits): string {
  return `<div class="medals" aria-label="Medals. Circle is reach, diamond is lean, bolt is swift.">
    ${medal('Reach', saved.reach || now.reach, '<circle cx="12" cy="12" r="5"/>')}
    ${medal('Lean', saved.lean || now.lean, '<path d="M12 5.5 L17.5 12 L12 18.5 L6.5 12 Z"/>')}
    ${medal('Swift', saved.swift || now.swift, '<path d="M13 4.5 L7.5 13 H11.5 L10.5 19.5 L16.5 11 H12.5 Z"/>')}
  </div>`;
}

function medal(name: string, on: boolean, shape: string): string {
  return `<span class="medal${on ? ' on' : ''}" title="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${shape}</svg><span class="sr">${name}${on ? ' earned' : ' open'}</span></span>`;
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    back: '<path d="M15 6 L9 12 L15 18"/>',
    gear: '<path d="M4 8 H9"/><path d="M15 8 H20"/><circle cx="12" cy="8" r="2.2"/><path d="M4 16 H7"/><path d="M13 16 H20"/><circle cx="10" cy="16" r="2.2"/>',
    undo: '<path d="M8 8 H14 A4 4 0 1 1 14 16 H8"/><path d="M8 8 L4 12 L8 16"/>',
    redo: '<path d="M16 8 H10 A4 4 0 1 0 10 16 H16"/><path d="M16 8 L20 12 L16 16"/>',
    left: '<path d="M14 7 L9 12 L14 17"/><path d="M10 12 H20"/>',
    right: '<path d="M10 7 L15 12 L10 17"/><path d="M14 12 H4"/>',
    up: '<path d="M7 14 L12 9 L17 14"/><path d="M12 10 V20"/>',
    down: '<path d="M7 10 L12 15 L17 10"/><path d="M12 14 V4"/>',
    copy: '<rect x="8" y="8" width="10" height="10" rx="1.5"/><path d="M6 16 V6 H16"/>',
    trash: '<path d="M8 8 H16 L15 19 H9 Z"/><path d="M6 8 H18"/><path d="M10 5 H14"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? ''}</svg>`;
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
