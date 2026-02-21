const { EMPTY, BOARD_SIZE } = require("./constants");

function getRandomPlayerMove(board) {
  const available = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === EMPTY) {
      available.push(i);
    }
  }

  if (available.length === 0) {
    return null;
  }

  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

module.exports = {
  getRandomPlayerMove
};
