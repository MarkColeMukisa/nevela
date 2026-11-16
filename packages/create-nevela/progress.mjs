// What the installer shows while it works: one line per thing it makes, with what is
// happening inside the slow ones and how long each took.
//
//   ⠹ Laravel packages        37/112  symfony/console          14s
//   ✔ Laravel packages        112 packages                   48.2s
//
// In a terminal the line of the step in hand moves: a spinner, what it is on, the time so
// far. Anywhere else (a log, CI) each step is one finished line and nothing is redrawn.

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** A terminal that can't draw braille (the old Windows console) gets these. */
const PLAIN_FRAMES = ['-', '\\', '|', '/'];

/** How long something took, as short as it reads well: 120ms, 1.9s, 48.2s, 2m 5s. */
export function took(ms) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const tenths = Math.round(ms / 100) / 10;
  if (tenths < 60) return `${tenths.toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** While a step runs: whole seconds, since tenths would only flicker. */
function soFar(ms) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const clip = (text, width) => (text.length <= width ? text : width <= 1 ? '' : `${text.slice(0, width - 1)}…`);

/**
 * One line of the list, without colour: the mark, the label, what there is to say about
 * it and the time, in columns that line up down the screen and never pass `columns`.
 * Returned in parts so the caller can colour each.
 */
export function layout({ label, detail = '', time = '', columns = 80 }) {
  const room = Math.max(40, Math.min(columns, 100)) - 6; // two spaces, the mark, a space, and a margin
  const timeWidth = 8;
  const labelWidth = Math.min(30, Math.max(label.length, 24));
  const detailWidth = Math.max(0, room - labelWidth - timeWidth - 2);
  return {
    label: clip(label, labelWidth).padEnd(labelWidth),
    detail: clip(detail, detailWidth).padEnd(detailWidth),
    time: time.padStart(timeWidth),
  };
}

/**
 * @param {object} options
 * @param {NodeJS.WriteStream} options.stream   Where to write: process.stdout.
 * @param {boolean} options.live                Whether lines may be redrawn in place: a terminal.
 * @param {boolean} [options.braille]           Whether the terminal draws braille. False for the plain spinner.
 * @param {{ dim: Function, green: Function, red: Function }} options.paint
 * @param {() => number} [options.now]
 */
export function createProgress({ stream, live, braille = true, paint, now = Date.now }) {
  const frames = braille ? FRAMES : PLAIN_FRAMES;
  const columns = () => stream.columns ?? 80;

  const render = (mark, parts) => `  ${mark} ${parts.label} ${paint.dim(parts.detail)} ${paint.dim(parts.time)}`.trimEnd();

  /**
   * Run one step and show it. `work` is given `say`: call it with a few words on what is
   * happening now. What `work` returns is what step() resolves to, with one exception: a
   * `seconds` on it is the time shown, for work that was already running before this.
   *
   * @param {string} label
   * @param {(say: ((text: string) => void) & { done: (text: string) => void }) => any} work
   * @param {{ failed?: (result: any) => boolean }} [options]  When the result means it didn't work: the line ends with a cross.
   */
  async function step(label, work, { failed } = {}) {
    const started = now();
    let detail = '';
    let summary = null;
    let frame = 0;
    let timer = null;

    const draw = () => {
      const parts = layout({ label, detail, time: soFar(now() - started), columns: columns() });
      stream.write(`\r${render(paint.dim(frames[frame++ % frames.length]), parts)}\x1b[K`);
    };
    const say = (text) => {
      detail = String(text ?? '');
    };
    say.done = (text) => {
      summary = String(text ?? '');
    };

    if (live) {
      stream.write('\x1b[?25l'); // the cursor would flicker along the line
      draw();
      timer = setInterval(draw, 80);
    }

    let result;
    let ok = true;
    try {
      result = await work(say);
      if (failed?.(result)) ok = false;
    } catch (error) {
      ok = false;
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      const ms = typeof result?.seconds === 'number' ? result.seconds * 1000 : now() - started;
      const parts = layout({ label, detail: summary ?? '', time: took(ms), columns: columns() });
      const line = render(ok ? paint.green('✔') : paint.red('✖'), parts);
      stream.write(live ? `\r${line}\x1b[K\n\x1b[?25h` : `${line}\n`);
    }
    return result;
  }

  /** A line under the last step, for something it made that deserves its own mention. */
  function note(label, detail = '') {
    const parts = layout({ label, detail, columns: columns() });
    stream.write(`${render(paint.green('✔'), parts)}\n`);
  }

  /** Put the cursor back if the program is stopped half way through a step. */
  function restore() {
    if (live) stream.write('\x1b[?25h');
  }

  return { step, note, restore };
}
