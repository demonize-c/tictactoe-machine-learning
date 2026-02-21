const EMPTY = 0;
const PLAYER2 = -1;
const MINMAX = 1;
const BOARD_SIZE = 9;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

module.exports = {
  EMPTY,
  PLAYER2,
  MINMAX,
  BOARD_SIZE,
  WIN_LINES
};
