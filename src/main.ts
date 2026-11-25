import './style.css';
import nubiUrl from './assets/nubi.svg?url';
import {
  calculateSeconds, DIFFICULTIES, GAME_MODES, MAX_LIVES, pointsForCorrect, QuestionDeck, roundSeconds, TABLES,
  type Difficulty, type GameMode, type GameSummary, type Question,
} from './game';
import { loadData, recordGame, saveData, type SavedData } from './storage';
import { shouldAskToRotate } from './orientation';

type Screen = 'home' | 'game' | 'scores' | 'summary';
type RoundPhase = 'active' | 'feedback';
type FeedbackKind = 'correct' | 'wrong' | 'escaped' | 'timeout';

interface Balloon {
  element: HTMLButtonElement;
  value: number;
  lane: number;
  heightRank: number;
  color: string;
  phase: number;
  escaped: boolean;
}

interface ActiveGame {
  mode: GameMode;
  playerName: string;
  tables: number[];
  difficulty: Difficulty;
  lives: number;
  score: number;
  correct: number;
  mistakes: number;
  deck: QuestionDeck;
  question: Question | null;
  balloons: Balloon[];
  phase: RoundPhase;
  elapsed: number;
  roundDuration: number;
  typedAnswer: string;
  feedbackLeft: number;
  requiresContinue: boolean;
  manualPause: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  rotation: number; spin: number; age: number; life: number;
  size: number; color: string;
}

// 24 light, saturated hues. Dark number labels remain readable across the palette.
const BALLOON_COLORS = Array.from({ length: 24 }, (_, index) =>
  `hsl(${index * 15} ${index % 3 === 0 ? 77 : 72}% ${index % 2 === 0 ? 72 : 68}%)`,
);
const root = document.querySelector<HTMLDivElement>('#app')!;
const orientationOverlay = document.querySelector<HTMLDivElement>('#orientation-overlay')!;
const orientationQuery = matchMedia('(orientation: landscape)');
const coarsePointerQuery = matchMedia('(pointer: coarse)');
const data: SavedData = loadData();
let screen: Screen = 'home';
let scoresReturn: 'home' | 'summary' = 'home';
let scoresMode: GameMode = data.selectedMode;
let game: ActiveGame | null = null;
let lastSummary: GameSummary | null = null;
let storageFailed = false;
let landscape = false;
let orientationDismissed = false;
let lastFrame = 0;
let particles: Particle[] = [];
let audioContext: AudioContext | null = null;
const pop = new Audio(`${import.meta.env.BASE_URL}audio/pop.mp3`);
pop.preload = 'auto';
pop.volume = 0.8;
const applause = new Audio(`${import.meta.env.BASE_URL}audio/applause.mp3`);
applause.preload = 'auto';
applause.volume = 0.55;

const canvas = document.createElement('canvas');
canvas.className = 'confetti-canvas';
canvas.setAttribute('aria-hidden', 'true');
document.body.append(canvas);
const canvasContext = canvas.getContext('2d')!;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function randomOrder<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function chooseBalloonColors(): string[] {
  const indices = randomOrder(Array.from({ length: BALLOON_COLORS.length }, (_, index) => index));
  const selected: number[] = [];
  for (const index of indices) {
    if (selected.every((other) => {
      const distance = Math.abs(index - other);
      return Math.min(distance, BALLOON_COLORS.length - distance) >= 4;
    })) selected.push(index);
    if (selected.length === 3) break;
  }
  return selected.map((index) => BALLOON_COLORS[index]);
}

function persist(): void {
  if (!saveData(data)) {
    storageFailed = true;
    showStorageWarning();
  }
}

function showStorageWarning(): void {
  if (!storageFailed || document.querySelector('.storage-warning')) return;
  const warning = document.createElement('div');
  warning.className = 'storage-warning';
  warning.setAttribute('role', 'status');
  warning.textContent = 'Puedes jugar, pero este navegador no permite guardar los resultados.';
  document.body.append(warning);
}

function shell(content: string, className = ''): string {
  return `<main class="app-shell ${className}">${content}</main>`;
}

function nubi(className = ''): string {
  return `<img class="nubi ${className}" src="${nubiUrl}" alt="Nubi, la nube sonriente" />`;
}

function selectedTablesText(): string {
  if (data.selectedTables.length === 0) return 'Ninguna tabla seleccionada';
  if (data.selectedTables.length === TABLES.length) return 'Todas las tablas seleccionadas';
  return `Tablas seleccionadas: ${data.selectedTables.join(', ')}`;
}

function tableButton(table: number): string {
  const selected = data.selectedTables.includes(table);
  return `<button class="table-chip ${selected ? 'selected' : ''}" type="button" data-table="${table}" aria-pressed="${selected}" aria-label="Tabla ${table}, ${selected ? 'seleccionada' : 'no seleccionada'}">${table}</button>`;
}

function soundButton(): string {
  return `<button class="icon-button sound-button" type="button" aria-label="${data.muted ? 'Activar sonido' : 'Silenciar sonido'}" title="${data.muted ? 'Activar sonido' : 'Silenciar sonido'}">${data.muted ? '🔇' : '🔊'}</button>`;
}

function wireSoundButton(): void {
  root.querySelector<HTMLButtonElement>('.sound-button')?.addEventListener('click', () => {
    data.muted = !data.muted;
    persist();
    const button = root.querySelector<HTMLButtonElement>('.sound-button')!;
    button.textContent = data.muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', data.muted ? 'Activar sonido' : 'Silenciar sonido');
    button.title = data.muted ? 'Activar sonido' : 'Silenciar sonido';
    if (data.muted) {
      pop.pause();
      applause.pause();
    } else playTap();
  });
}

function renderHome(editName = !data.playerName): void {
  screen = 'home';
  game = null;
  const nameBlock = editName
    ? `<form class="name-form" id="name-form">
        <label for="player-name">¿Cómo te llamas?</label>
        <div class="name-row"><input id="player-name" name="name" type="text" maxlength="20" autocomplete="nickname" enterkeyhint="done" placeholder="Escribe tu nombre" value="${escapeHtml(data.playerName)}" required /><button class="small-button" type="submit">Guardar</button></div>
        <p class="form-error" id="name-error" aria-live="polite"></p>
      </form>`
    : `<div class="welcome-player"><span>¡Hola, <strong>${escapeHtml(data.playerName)}</strong>!</span><button class="text-button" id="change-player" type="button">Cambiar nombre</button></div>`;

  root.innerHTML = shell(`
    <div class="home-screen screen">
      <div class="top-tools"><button class="icon-button info-button" id="show-info" type="button" aria-label="Información sobre el juego" title="Información">i</button>${soundButton()}</div>
      <div class="hero">
        <span class="eyebrow">EL JUEGO DE LAS TABLAS</span>
        <h1>¡Multiplica<br /><em>y vuela!</em></h1>
        <div class="hero-mascot">${nubi('nubi-hero')}<span class="speech-bubble">¡Vamos a jugar!</span></div>
      </div>
      <section class="setup-card" aria-label="Preparar partida">
        ${nameBlock}
        <div class="setting-block">
          <h2>Elige el modo</h2>
          <div class="mode-grid" role="group" aria-label="Modo de juego">
            <button class="mode-chip ${data.selectedMode === 'review' ? 'selected' : ''}" type="button" data-mode="review" aria-pressed="${data.selectedMode === 'review'}"><strong>🎈 Repaso</strong><span>Toca la respuesta correcta</span></button>
            <button class="mode-chip ${data.selectedMode === 'calculate' ? 'selected' : ''}" type="button" data-mode="calculate" aria-pressed="${data.selectedMode === 'calculate'}"><strong>🔢 Calcula</strong><span>Escribe el resultado</span></button>
          </div>
        </div>
        <div class="setting-block">
          <div class="setting-heading"><h2>Elige tus tablas</h2><span>Del 1 al 9</span></div>
          <div class="table-grid" role="group" aria-label="Tablas de multiplicar">
            ${TABLES.map(tableButton).join('')}
          </div>
          <p class="table-status" id="tables-summary" role="status" aria-live="polite">${selectedTablesText()}</p>
          <p class="selection-error" id="tables-error" aria-live="polite"></p>
        </div>
        <div class="setting-block">
          <h2>Elige la dificultad</h2>
          <div class="difficulty-grid" role="group" aria-label="Dificultad">
            ${(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => `<button class="difficulty-chip ${data.difficulty === difficulty ? 'selected' : ''}" type="button" data-difficulty="${difficulty}" aria-pressed="${data.difficulty === difficulty}"><span aria-hidden="true">${DIFFICULTIES[difficulty].emoji}</span><span>${DIFFICULTIES[difficulty].label}</span></button>`).join('')}
          </div>
        </div>
        <button class="primary-button start-button" id="start-game" type="button">¡A volar! <span aria-hidden="true">➜</span></button>
      </section>
      <button class="secondary-button leaderboard-link" id="show-scores" type="button">🏆 Ver mejores puntuaciones</button>
      <p class="home-note" id="home-note">${data.selectedMode === 'review' ? '5 vidas · 3 globos · ¡muchas multiplicaciones!' : '5 vidas · escribe el resultado antes de que se acabe el tiempo'}</p>
    </div>
    <dialog class="info-dialog" id="info-dialog" aria-labelledby="info-title">
      <div class="info-header"><span class="eyebrow">UN POQUITO SOBRE EL JUEGO</span><button class="icon-button info-close" id="close-info" type="button" aria-label="Cerrar información">×</button></div>
      <h2 id="info-title">¡Multiplica y vuela!</h2>
      <p>Practica las tablas del 1 al 9 a tu ritmo. En <strong>Repaso</strong>, toca el globo con la respuesta correcta. En <strong>Calcula</strong>, escribe el resultado antes de que se acabe el tiempo. Elige tus tablas y tu dificultad, ¡y a volar!</p>
      <div class="info-privacy"><strong>🔒 Tu juego, tus datos</strong><p>No usamos cookies ni herramientas de seguimiento. Tu nombre, tus preferencias y tus puntuaciones se guardan solo en este navegador para que puedas seguir jugando y consultar tus resultados. El juego no los envía a terceros ni los utiliza con fines comerciales.</p></div>
      <div class="info-support"><strong>☕ ¿Te ha gustado?</strong><p>Si te apetece apoyar el juego, puedes invitarme a un café.</p><a class="secondary-button coffee-link" href="https://buymeacoffee.com/alejandrosuch" target="_blank" rel="noopener noreferrer">Invítame a un café ↗</a><small>El enlace abre una página externa.</small></div>
    </dialog>
  `, 'home-shell');

  wireSoundButton();
  const infoDialog = root.querySelector<HTMLDialogElement>('#info-dialog')!;
  const infoButton = root.querySelector<HTMLButtonElement>('#show-info')!;
  infoButton.addEventListener('click', () => { playTap(); infoDialog.showModal(); });
  root.querySelector<HTMLButtonElement>('#close-info')!.addEventListener('click', () => infoDialog.close());
  infoDialog.addEventListener('close', () => infoButton.focus());
  infoDialog.addEventListener('click', (event) => { if (event.target === infoDialog) infoDialog.close(); });
  root.querySelector<HTMLButtonElement>('#change-player')?.addEventListener('click', () => renderHome(true));
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    data.selectedMode = button.dataset.mode as GameMode;
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((choice) => {
      const selected = choice.dataset.mode === data.selectedMode;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
    root.querySelector<HTMLElement>('#home-note')!.textContent = data.selectedMode === 'review'
      ? '5 vidas · 3 globos · ¡muchas multiplicaciones!'
      : '5 vidas · escribe el resultado antes de que se acabe el tiempo';
    scoresMode = data.selectedMode;
    persist();
    playTap();
  }));
  root.querySelector<HTMLFormElement>('#name-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = root.querySelector<HTMLInputElement>('#player-name')!;
    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name) {
      root.querySelector<HTMLElement>('#name-error')!.textContent = 'Escribe tu nombre para jugar.';
      input.focus();
      return;
    }
    data.playerName = name;
    persist();
    playTap();
    renderHome(false);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-table]').forEach((button) => button.addEventListener('click', () => {
    const table = Number(button.dataset.table);
    data.selectedTables = data.selectedTables.includes(table)
      ? data.selectedTables.filter((value) => value !== table)
      : [...data.selectedTables, table].sort((a, b) => a - b);
    const selected = data.selectedTables.includes(table);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Tabla ${table}, ${selected ? 'seleccionada' : 'no seleccionada'}`);
    root.querySelector<HTMLElement>('#tables-summary')!.textContent = selectedTablesText();
    root.querySelector<HTMLElement>('#tables-error')!.textContent = '';
    persist();
    playTap();
  }));

  root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
    data.difficulty = button.dataset.difficulty as Difficulty;
    root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((chip) => {
      chip.classList.toggle('selected', chip === button);
      chip.setAttribute('aria-pressed', String(chip === button));
    });
    persist();
    playTap();
  }));

  root.querySelector<HTMLButtonElement>('#start-game')!.addEventListener('click', () => {
    if (!data.playerName) {
      root.querySelector<HTMLElement>('#name-error')!.textContent = 'Guarda tu nombre para empezar.';
      root.querySelector<HTMLInputElement>('#player-name')?.focus();
      return;
    }
    if (data.selectedTables.length === 0) {
      root.querySelector<HTMLElement>('#tables-error')!.textContent = 'Elige al menos una tabla.';
      return;
    }
    unlockAudio();
    playTap();
    startGame();
  });
  root.querySelector<HTMLButtonElement>('#show-scores')!.addEventListener('click', () => { scoresReturn = 'home'; scoresMode = data.selectedMode; playTap(); renderScores(); });
  showStorageWarning();
}

function startGame(): void {
  game = {
    mode: data.selectedMode,
    playerName: data.playerName,
    tables: [...data.selectedTables],
    difficulty: data.difficulty,
    lives: MAX_LIVES,
    score: 0,
    correct: 0,
    mistakes: 0,
    deck: new QuestionDeck(data.selectedTables),
    question: null,
    balloons: [],
    phase: 'active',
    elapsed: 0,
    roundDuration: 0,
    typedAnswer: '',
    feedbackLeft: 0,
    requiresContinue: false,
    manualPause: false,
  };
  screen = 'game';
  root.innerHTML = shell(`
    <div class="game-screen screen ${game.mode === 'calculate' ? 'calculate-screen' : ''}">
      <div class="game-topbar"><button class="icon-button pause-button" id="pause-game" type="button" aria-label="Pausar partida" title="Pausar">Ⅱ</button><span class="player-pill">${escapeHtml(game.playerName)}</span>${soundButton()}</div>
      <div class="hud"><div class="score-pill"><span class="hud-label">PUNTOS</span><strong id="score-value">0</strong></div><div class="lives-pill" id="lives-value" role="status" aria-live="polite" aria-label="5 vidas"></div></div>
      <div class="question-board"><span class="question-caption">¿Cuánto es?</span><strong id="question-text"></strong><span class="speed-badge" id="speed-badge"></span></div>
      ${game.mode === 'review'
        ? `<div class="playfield" id="playfield" aria-label="Globos con respuestas"></div><div class="game-bottom"><span>¡Toca el globo correcto!</span><span class="round-count" id="round-count"></span></div>`
        : `<div class="calculate-content">
            <div class="timer-wrap"><div class="timer-label"><span>TIEMPO</span><strong id="timer-seconds"></strong></div><div class="timer-track" id="timer-track" role="progressbar" aria-label="Tiempo restante" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div class="timer-fill" id="timer-fill"></div></div></div>
            <div class="answer-display" id="answer-display" role="status" aria-live="polite" aria-label="Respuesta vacía">?</div>
            <div class="digit-grid keypad-grid" role="group" aria-label="Teclado numérico">${[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].map((digit) => digit === null ? '<span aria-hidden="true"></span>' : `<button class="keypad-key" type="button" data-digit="${digit}" aria-label="Dígito ${digit}">${digit}</button>`).join('')}</div>
            <div class="answer-actions"><button class="secondary-button" id="clear-answer" type="button">Borrar</button><button class="primary-button" id="validate-answer" type="button" disabled>Validar</button></div>
            <div class="calculate-feedback" id="calculate-feedback" aria-live="polite"></div>
            <div class="game-bottom"><span>Escribe el resultado</span><span class="round-count" id="round-count"></span></div>
          </div>`}
      <div class="pause-overlay" id="pause-overlay" hidden><div class="pause-card">${nubi('nubi-pause')}<h2>¡Un descansito!</h2><p>Los globos esperan por ti.</p><button class="primary-button" id="resume-game" type="button">Seguir jugando</button><button class="text-button" id="quit-game" type="button">Salir de la partida</button></div></div>
    </div>
  `, 'game-shell');
  wireSoundButton();
  root.querySelector<HTMLButtonElement>('#pause-game')!.addEventListener('click', () => setManualPause(true));
  root.querySelector<HTMLButtonElement>('#resume-game')!.addEventListener('click', () => setManualPause(false));
  root.querySelector<HTMLButtonElement>('#quit-game')!.addEventListener('click', () => renderHome(false));
  if (game.mode === 'calculate') {
    root.querySelectorAll<HTMLButtonElement>('.keypad-key').forEach((button) => button.addEventListener('click', () => enterDigit(button.dataset.digit!, button)));
    root.querySelector<HTMLButtonElement>('#clear-answer')!.addEventListener('click', clearAnswer);
    root.querySelector<HTMLButtonElement>('#validate-answer')!.addEventListener('click', validateAnswer);
  }
  updateHud();
  startRound();
}

function setManualPause(paused: boolean): void {
  if (!game) return;
  game.manualPause = paused;
  root.querySelector<HTMLElement>('#pause-overlay')!.hidden = !paused;
  lastFrame = 0;
  if (paused) applause.pause();
  else playTap();
}

function updateHud(): void {
  if (!game || screen !== 'game') return;
  root.querySelector<HTMLElement>('#score-value')!.textContent = String(game.score);
  root.querySelector<HTMLElement>('#lives-value')!.innerHTML = Array.from({ length: MAX_LIVES }, (_, index) =>
    `<span class="heart ${index < game!.lives ? '' : 'empty'}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 21.1 10.6 19.8C5.3 15 2 12 2 8.4 2 5.4 4.4 3 7.5 3c1.8 0 3.4.8 4.5 2.1C13.1 3.8 14.7 3 16.5 3 19.6 3 22 5.4 22 8.4c0 3.6-3.3 6.6-8.6 11.4L12 21.1Z"/></svg></span>`,
  ).join('');
  root.querySelector<HTMLElement>('#lives-value')!.setAttribute('aria-label', `${game.lives} vidas`);
  root.querySelector<HTMLElement>('#round-count')!.textContent = `${game.correct} aciertos`;
  root.querySelector<HTMLElement>('#speed-badge')!.textContent = `${game.mode === 'review' ? 'Velocidad' : 'Nivel'} ${Math.floor(game.correct / 10) + 1}`;
}

function balloonMarkup(value: number, color: string, index: number): string {
  return `<button class="balloon" type="button" data-balloon="${index}" style="--balloon-color: ${color}" aria-label="Respuesta ${value}">
    <svg class="balloon-art" viewBox="0 0 100 150" aria-hidden="true">
      <path class="balloon-shape" d="M50 4C23 4 8 26 8 55c0 29 20 52 42 61 22-9 42-32 42-61C92 26 77 4 50 4Z" stroke="#3b6e86" stroke-opacity=".25" stroke-width="2"/>
      <path d="M50 115l-7 10h14z" fill="var(--balloon-color)" stroke="#3b6e86" stroke-opacity=".25" stroke-width="2"/>
      <path d="M50 125c-7 8 7 12 0 20" fill="none" stroke="#6a7e91" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="32" cy="33" rx="9" ry="20" transform="rotate(27 32 33)" fill="#fff" opacity=".35"/>
    </svg>
    <span class="balloon-number">${value}</span>
  </button>`;
}

function startRound(): void {
  if (!game || screen !== 'game') return;
  game.question = game.deck.next();
  game.phase = 'active';
  game.elapsed = 0;
  game.roundDuration = game.mode === 'calculate' ? calculateSeconds(game.difficulty, game.correct) : 0;
  game.typedAnswer = '';
  game.feedbackLeft = 0;
  game.requiresContinue = false;
  const question = game.question;
  root.querySelector<HTMLElement>('#question-text')!.textContent = `${question.table} × ${question.multiplier}`;
  if (game.mode === 'calculate') {
    root.querySelector<HTMLElement>('#calculate-feedback')!.innerHTML = '';
    root.querySelector<HTMLElement>('#calculate-feedback')!.classList.remove('visible');
    root.querySelector<HTMLButtonElement>('#clear-answer')!.disabled = false;
    updateAnswer();
    updateTimer();
    updateHud();
    return;
  }
  const colors = chooseBalloonColors();
  const heightRanks = randomOrder([0, 1, 2]);
  const playfield = root.querySelector<HTMLElement>('#playfield')!;
  playfield.classList.remove('show-feedback');
  playfield.innerHTML = `<div class="balloon-layer">${question.options.map((value, index) => balloonMarkup(value, colors[index], index)).join('')}</div>`
    + '<div class="feedback-layer" id="feedback-layer" aria-live="polite"></div>';
  game.balloons = question.options.map((value, index) => ({
    element: playfield.querySelector<HTMLButtonElement>(`[data-balloon="${index}"]`)!,
    value,
    lane: index,
    heightRank: heightRanks[index],
    color: colors[index],
    phase: Math.random() * Math.PI * 2,
    escaped: false,
  }));
  game.balloons.forEach((balloon) => balloon.element.addEventListener('click', () => chooseBalloon(balloon)));
  updateHud();
  positionBalloons();
}

function updateAnswer(): void {
  if (!game || game.mode !== 'calculate') return;
  const display = root.querySelector<HTMLElement>('#answer-display')!;
  display.textContent = game.typedAnswer || '?';
  display.setAttribute('aria-label', game.typedAnswer ? `Respuesta ${game.typedAnswer}` : 'Respuesta vacía');
  root.querySelector<HTMLButtonElement>('#validate-answer')!.disabled = game.typedAnswer.length === 0 || game.phase !== 'active';
}

function enterDigit(digit: string, button?: HTMLButtonElement): void {
  if (!game || game.mode !== 'calculate' || game.phase !== 'active' || isPaused() || game.typedAnswer.length >= 2) return;
  game.typedAnswer += digit;
  const key = button ?? root.querySelector<HTMLButtonElement>(`.keypad-key[data-digit="${digit}"]`);
  if (key) {
    key.classList.remove('key-pressed');
    void key.offsetWidth;
    key.classList.add('key-pressed');
  }
  playTap();
  updateAnswer();
}

function clearAnswer(): void {
  if (!game || game.mode !== 'calculate' || game.phase !== 'active' || isPaused()) return;
  game.typedAnswer = '';
  playTap();
  updateAnswer();
}

function validateAnswer(): void {
  if (!game || game.mode !== 'calculate' || game.phase !== 'active' || isPaused() || !game.typedAnswer) return;
  finishRound(Number(game.typedAnswer) === game.question!.answer ? 'correct' : 'wrong');
}

function updateTimer(): void {
  if (!game || game.mode !== 'calculate') return;
  const remaining = Math.max(0, game.roundDuration - game.elapsed);
  const percent = Math.max(0, Math.min(100, remaining / game.roundDuration * 100));
  root.querySelector<HTMLElement>('#timer-seconds')!.textContent = `${Math.ceil(remaining)} s`;
  root.querySelector<HTMLElement>('#timer-fill')!.style.width = `${percent}%`;
  const track = root.querySelector<HTMLElement>('#timer-track')!;
  track.setAttribute('aria-valuenow', String(Math.round(percent)));
  track.setAttribute('aria-valuetext', `${Math.ceil(remaining)} segundos restantes`);
  track.classList.toggle('timer-low', percent <= 25);
}

function positionBalloons(): void {
  if (!game || screen !== 'game' || game.phase !== 'active') return;
  if (landscape || document.hidden) return;
  const field = root.querySelector<HTMLElement>('#playfield');
  if (!field) return;
  const width = field.clientWidth;
  const height = field.clientHeight;
  const spacing = Math.min(height * 0.12, 75);
  const seconds = roundSeconds(game.difficulty, game.correct);
  const speed = (height - 8) / seconds;
  for (const balloon of game.balloons) {
    if (balloon.escaped) continue;
    const balloonHeight = balloon.element.offsetHeight;
    const balloonWidth = balloon.element.offsetWidth;
    const y = height - balloonHeight - 8 - balloon.heightRank * spacing - game.elapsed * speed;
    if (y + balloonHeight <= 0) {
      balloon.escaped = true;
      balloon.element.hidden = true;
      continue;
    }
    const fadeDistance = Math.min(96, Math.max(56, height * 0.14));
    const visibleRatio = Math.min(1, Math.max(0, (y + balloonHeight) / (balloonHeight + fadeDistance)));
    balloon.element.style.setProperty('--exit-opacity', String(visibleRatio ** 1.5));
    const amplitude = Math.max(0, Math.min(12, (width / 3 - balloonWidth) / 2 - 4));
    const sway = Math.sin(game.elapsed * (2 * Math.PI / 2.7) + balloon.phase) * amplitude;
    balloon.element.style.left = `${width * (balloon.lane + 0.5) / 3}px`;
    balloon.element.style.transform = `translate3d(calc(-50% + ${sway}px), ${y}px, 0)`;
  }
  if (game.balloons.every((balloon) => balloon.escaped)) finishRound('escaped');
}

function chooseBalloon(balloon: Balloon): void {
  if (!game || screen !== 'game' || game.phase !== 'active' || isPaused() || balloon.escaped) return;
  finishRound(balloon.value === game.question!.answer ? 'correct' : 'wrong', balloon);
}

function finishRound(kind: FeedbackKind, chosen?: Balloon): void {
  if (!game || game.phase !== 'active' || !game.question) return;
  game.phase = 'feedback';
  game.feedbackLeft = 1.65;
  game.requiresContinue = kind !== 'correct';
  const question = game.question;
  let message: string;
  let detail: string;
  if (kind === 'correct') {
    const gained = pointsForCorrect(game.difficulty, game.correct);
    game.score += gained;
    game.correct += 1;
    message = '¡Muy bien!';
    detail = `+${gained} puntos`;
    chosen?.element.classList.add('burst-correct');
    if (chosen) burstConfetti(chosen.element);
    else if (game.mode === 'calculate') burstConfetti(root.querySelector<HTMLElement>('#answer-display')!);
    playApplause();
  } else {
    game.lives -= 1;
    game.mistakes += 1;
    message = kind === 'wrong' ? '¡Casi lo tienes!' : kind === 'timeout' ? '¡Se acabó el tiempo!' : '¡Se escaparon!';
    detail = `${question.table} × ${question.multiplier} = ${question.answer}`;
    if (chosen) {
      chosen.element.classList.add('burst-wrong');
      playPop();
    } else playPop();
  }
  if (game.mode === 'calculate') {
    root.querySelector<HTMLButtonElement>('#validate-answer')!.disabled = true;
    root.querySelector<HTMLButtonElement>('#clear-answer')!.disabled = true;
    const layer = root.querySelector<HTMLElement>('#calculate-feedback')!;
    const continueButton = game.requiresContinue
      ? `<button class="secondary-button feedback-continue" type="button">${game.lives <= 0 ? 'Ver resultado' : 'Vale, seguir'}</button>` : '';
    layer.innerHTML = `<div class="feedback-card ${kind}"><div class="feedback-main">${nubi('nubi-feedback')}<div class="feedback-copy"><strong>${message}</strong><span>${detail}</span></div></div>${continueButton}</div>`;
    layer.classList.add('visible');
    layer.querySelector<HTMLButtonElement>('.feedback-continue')?.addEventListener('click', continueAfterFeedback);
    updateHud();
    return;
  }
  game.balloons.forEach((balloon) => {
    balloon.element.disabled = true;
    if (balloon !== chosen) balloon.element.classList.add('fade-away');
  });
  const layer = root.querySelector<HTMLElement>('#feedback-layer')!;
  layer.classList.toggle('awaiting', game.requiresContinue);
  const continueButton = game.requiresContinue
    ? `<button class="secondary-button feedback-continue" type="button">${game.lives <= 0 ? 'Ver resultado' : 'Vale, seguir'}</button>`
    : '';
  layer.innerHTML = `<div class="feedback-card ${kind}"><div class="feedback-main">${nubi('nubi-feedback')}<div class="feedback-copy"><strong>${message}</strong><span>${detail}</span></div></div>${continueButton}</div>`;
  layer.querySelector<HTMLButtonElement>('.feedback-continue')?.addEventListener('click', continueAfterFeedback);
  root.querySelector<HTMLElement>('#playfield')!.classList.add('show-feedback');
  updateHud();
}

function continueAfterFeedback(): void {
  if (!game || game.phase !== 'feedback' || !game.requiresContinue || isPaused()) return;
  playTap();
  if (game.lives <= 0) endGame();
  else startRound();
}

function endGame(): void {
  if (!game) return;
  const summary: GameSummary = {
    id: crypto.randomUUID(),
    mode: game.mode,
    playerName: game.playerName,
    score: game.score,
    correct: game.correct,
    mistakes: game.mistakes,
    difficulty: game.difficulty,
    tables: [...game.tables],
    completedAt: new Date().toISOString(),
  };
  lastSummary = summary;
  Object.assign(data, recordGame(data, summary));
  persist();
  game = null;
  renderSummary();
}

function renderSummary(): void {
  if (!lastSummary) return renderHome(false);
  screen = 'summary';
  const rank = data.highScores.filter((entry) => entry.mode === lastSummary!.mode).findIndex((entry) => entry.id === lastSummary!.id) + 1;
  root.innerHTML = shell(`
    <div class="summary-screen screen">
      <div class="top-tools">${soundButton()}</div>
      <div class="summary-content">
        ${nubi('nubi-summary')}
        <span class="eyebrow">${GAME_MODES[lastSummary.mode].toUpperCase()} · PARTIDA TERMINADA</span>
        <h1>¡Buen vuelo,<br />${escapeHtml(lastSummary.playerName)}!</h1>
        <div class="result-card"><span>CONSEGUISTE</span><strong>${lastSummary.score}</strong><span>PUNTOS</span></div>
        ${rank ? `<div class="rank-message">🏆 ¡Puesto ${rank} en el top 10!</div>` : ''}
        <div class="summary-stats"><span>🎯 ${lastSummary.correct} aciertos</span><span>💫 ${lastSummary.mistakes} fallos</span></div>
        <button class="primary-button" id="play-again" type="button">Jugar otra vez <span aria-hidden="true">➜</span></button>
        <button class="secondary-button" id="summary-scores" type="button">🏆 Ver puntuaciones</button>
        <button class="text-button" id="summary-home" type="button">Cambiar modo, tablas o dificultad</button>
      </div>
    </div>
  `, 'summary-shell');
  wireSoundButton();
  root.querySelector<HTMLButtonElement>('#play-again')!.addEventListener('click', () => { unlockAudio(); startGame(); });
  root.querySelector<HTMLButtonElement>('#summary-scores')!.addEventListener('click', () => { scoresReturn = 'summary'; scoresMode = lastSummary!.mode; renderScores(); });
  root.querySelector<HTMLButtonElement>('#summary-home')!.addEventListener('click', () => renderHome(false));
}

function renderScores(): void {
  screen = 'scores';
  const scores = data.highScores.filter((entry) => entry.mode === scoresMode);
  const rows = scores.length
    ? scores.map((entry, index) => `<li class="score-row"><span class="rank-number">${index + 1}</span><div class="score-person"><strong>${escapeHtml(entry.playerName)}</strong><small>${DIFFICULTIES[entry.difficulty].label} · Tablas ${entry.tables.join(', ')}</small></div><span class="score-number">${entry.score}</span></li>`).join('')
    : `<li class="empty-scores">${nubi('nubi-empty')}<strong>¡Aún no hay puntuaciones!</strong><span>Juega una partida y estrena el marcador.</span></li>`;
  root.innerHTML = shell(`
    <div class="scores-screen screen">
      <div class="scores-header"><button class="icon-button back-button" id="back-scores" type="button" aria-label="Volver">←</button><span>EL SALÓN DE LA FAMA</span>${soundButton()}</div>
      <h1>🏆 Los 10 mejores</h1>
      <div class="scores-tabs" role="group" aria-label="Clasificación por modo">${(Object.keys(GAME_MODES) as GameMode[]).map((mode) => `<button class="score-tab ${scoresMode === mode ? 'selected' : ''}" type="button" data-score-mode="${mode}" aria-pressed="${scoresMode === mode}">${GAME_MODES[mode]}</button>`).join('')}</div>
      <ol class="scores-list">${rows}</ol>
      <p class="scores-note">Las puntuaciones se guardan en este navegador.</p>
      <button class="primary-button scores-play" id="scores-play" type="button">Jugar a ${GAME_MODES[scoresMode]}</button>
    </div>
  `, 'scores-shell');
  wireSoundButton();
  root.querySelector<HTMLButtonElement>('#back-scores')!.addEventListener('click', () => scoresReturn === 'summary' ? renderSummary() : renderHome(false));
  root.querySelectorAll<HTMLButtonElement>('[data-score-mode]').forEach((button) => button.addEventListener('click', () => { scoresMode = button.dataset.scoreMode as GameMode; playTap(); renderScores(); }));
  root.querySelector<HTMLButtonElement>('#scores-play')!.addEventListener('click', () => {
    data.selectedMode = scoresMode;
    persist();
    if (data.playerName && data.selectedTables.length) { unlockAudio(); startGame(); }
    else renderHome(!data.playerName);
  });
}

function isPaused(): boolean {
  return landscape || document.hidden || Boolean(game?.manualPause);
}

function updateOrientation(): void {
  const active = document.activeElement;
  const textInputFocused = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  const signals = {
    coarsePointer: coarsePointerQuery.matches,
    dismissed: false,
    textInputFocused,
    legacyAngle: typeof window.orientation === 'number' ? window.orientation : undefined,
    screenType: window.screen.orientation?.type,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  };
  const physicallyLandscape = shouldAskToRotate(signals);
  if (!physicallyLandscape && !textInputFocused) orientationDismissed = false;
  landscape = shouldAskToRotate({ ...signals, dismissed: orientationDismissed });
  orientationOverlay.classList.toggle('is-visible', landscape);
  lastFrame = 0;
  if (landscape) {
    pop.pause();
    applause.pause();
  }
  if (!landscape) positionBalloons();
}

function resizeCanvas(): void {
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * pixelRatio);
  canvas.height = Math.round(innerHeight * pixelRatio);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  canvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function burstConfetti(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height * 0.36;
  for (let index = 0; index < 65; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 210;
    particles.push({
      x: centerX, y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 70,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 14,
      age: 0, life: 1.1 + Math.random() * 0.7,
      size: 5 + Math.random() * 7,
      color: BALLOON_COLORS[index % BALLOON_COLORS.length],
    });
  }
}

function drawConfetti(dt: number): void {
  canvasContext.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((particle) => particle.age < particle.life);
  for (const particle of particles) {
    if (!isPaused()) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 420 * dt;
      particle.rotation += particle.spin * dt;
    }
    canvasContext.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
    canvasContext.save();
    canvasContext.translate(particle.x, particle.y);
    canvasContext.rotate(particle.rotation);
    canvasContext.fillStyle = particle.color;
    canvasContext.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.65);
    canvasContext.restore();
  }
  canvasContext.globalAlpha = 1;
}

function unlockAudio(): void {
  if (data.muted) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  } catch {
    audioContext = null;
  }
}

function playTap(): void {
  if (data.muted) return;
  try {
    unlockAudio();
    const context = audioContext!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(620, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(840, context.currentTime + 0.07);
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  } catch { /* Audio is optional; gameplay continues. */ }
}

function playPop(): void {
  if (data.muted) return;
  try {
    pop.pause();
    pop.currentTime = 0;
    void pop.play().catch(() => { /* Browser audio policy may block playback. */ });
  } catch { /* Audio is optional; gameplay continues. */ }
}

function playApplause(): void {
  if (data.muted) return;
  try {
    applause.pause();
    applause.currentTime = 0;
    void applause.play().catch(() => { /* Browser audio policy may block playback. */ });
  } catch { /* Audio is optional; gameplay continues. */ }
}

function frame(timestamp: number): void {
  const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
  lastFrame = timestamp;
  if (game && screen === 'game' && !isPaused()) {
    if (game.phase === 'active') {
      game.elapsed += dt;
      if (game.mode === 'review') positionBalloons();
      else {
        updateTimer();
        if (game.elapsed >= game.roundDuration) finishRound('timeout');
      }
    } else if (!game.requiresContinue) {
      game.feedbackLeft -= dt;
      if (game.feedbackLeft <= 0) {
        if (game.lives <= 0) endGame();
        else startRound();
      }
    }
  }
  drawConfetti(dt);
  requestAnimationFrame(frame);
}

document.addEventListener('keydown', (event) => {
  if (!game || game.mode !== 'calculate' || screen !== 'game' || game.phase !== 'active' || isPaused()) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (/^[0-9]$/.test(event.key)) { event.preventDefault(); enterDigit(event.key); }
  else if (event.key === 'Backspace' || event.key === 'Escape') { event.preventDefault(); clearAnswer(); }
  else if (event.key === 'Enter') { event.preventDefault(); validateAnswer(); }
});

orientationQuery.addEventListener('change', updateOrientation);
coarsePointerQuery.addEventListener('change', updateOrientation);
window.screen.orientation?.addEventListener('change', updateOrientation);
window.addEventListener('orientationchange', () => {
  updateOrientation();
  window.setTimeout(updateOrientation, 250);
});
document.addEventListener('focusin', updateOrientation);
document.addEventListener('focusout', () => window.setTimeout(updateOrientation, 0));
document.querySelector<HTMLButtonElement>('#orientation-dismiss')!.addEventListener('click', () => {
  orientationDismissed = true;
  updateOrientation();
});
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden) {
    pop.pause();
    applause.pause();
  }
});
window.addEventListener('resize', () => { resizeCanvas(); updateOrientation(); });
resizeCanvas();
updateOrientation();
renderHome();
requestAnimationFrame(frame);
