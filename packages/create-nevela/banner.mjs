// The name, large, at the top of the commands you run from anywhere: new, update, help.
//
// The same block letters as the Laravel installer and Grit, in Nevela's colours, one
// colour to a row so the name runs from blue through indigo to pink.

const LETTERS = {
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
};

/** "NEVELA", six rows of the same width. */
export const ROWS = [0, 1, 2, 3, 4, 5].map((row) => [...'NEVELA'].map((letter) => LETTERS[letter][row]).join(''));
export const WIDTH = ROWS[0].length;

export const TAGLINE = 'Describe a resource. Get the API and the dashboard.';

/** A colour for each row, top to bottom, for what the terminal can show. */
const GRADIENT = {
  // 16.7 million colours
  24: ['38;2;79;123;255', '38;2;99;102;241', '38;2;124;92;246', '38;2;168;85;247', '38;2;217;70;239', '38;2;244;114;182'],
  // 256 colours
  8: ['38;5;69', '38;5;63', '38;5;99', '38;5;135', '38;5;171', '38;5;205'],
  // 16 colours: blue above, magenta below
  4: ['94', '94', '94', '95', '95', '95'],
};

/**
 * The banner, as text to print.
 *
 * @param {object} options
 * @param {string} options.version
 * @param {number} options.depth    Bits of colour the terminal has: 24, 8, 4, 1 for none,
 *                                  and 0 when the output isn't a terminal at all.
 * @param {number} [options.columns]  How wide the terminal is
 * @param {boolean} [options.compact]  The name on one line, whatever the terminal can show
 */
export function banner({ version, depth, columns = 80, compact = false }) {
  const paint = (code, text) => (depth > 1 ? `\x1b[${code}m${text}\x1b[0m` : text);
  // Into a file or a pipe, or a terminal too narrow for the letters: the name on one line.
  if (compact || depth === 0 || columns < WIDTH + 4) {
    // Indigo where there are 256 colours to pick it from; magenta where there are 16.
    return `\n  ${paint(depth >= 8 ? '1;38;5;99' : '1;95', 'Nevela')} ${paint(2, `v${version}`)}\n`;
  }
  const colours = GRADIENT[depth >= 24 ? 24 : depth >= 8 ? 8 : 4];
  const rows = ROWS.map((row, index) => `  ${paint(colours[index], row)}`);
  return `\n${rows.join('\n')}\n\n  ${paint(2, `${TAGLINE} v${version}`)}\n`;
}
