const { EMPTY, PLAYER2, MINMAX, BOARD_SIZE, WIN_LINES } = require("./constants");

function checkWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] !== EMPTY && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return EMPTY;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== EMPTY);
}

function minimaxScore(board, isMaximizing) {
  const winner = checkWinner(board);

  if (winner === MINMAX) {
    return 10;
  }
  if (winner === PLAYER2) {
    return -10;
  }
  if (isBoardFull(board)) {
    return 0;
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      if (board[i] === EMPTY) {
        board[i] = MINMAX;
        const score = minimaxScore(board, false);
        board[i] = EMPTY;
        if (score > best) {
          best = score;
        }
      }
    }
    return best;
  }

  let best = Infinity;
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === EMPTY) {
      board[i] = PLAYER2;
      const score = minimaxScore(board, true);
      board[i] = EMPTY;
      if (score < best) {
        best = score;
      }
    }
  }
  return best;
}

function getMinimaxMove(board) {
  let bestScore = -Infinity;
  let bestMoves = [];

  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === EMPTY) {
      board[i] = MINMAX;
      const score = minimaxScore(board, false);
      board[i] = EMPTY;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
  }

  if (bestMoves.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * bestMoves.length);
  return bestMoves[randomIndex];
}

function getMinimaxMoveForPlayer(board, player) {
  if (player === MINMAX) {
    return getMinimaxMove([...board]);
  }

  if (player === PLAYER2) {
    const mirroredBoard = board.map((cell) => {
      if (cell === EMPTY) {
        return EMPTY;
      }
      return cell * -1;
    });
    return getMinimaxMove(mirroredBoard);
  }

  throw new Error("Invalid player for minimax move.");
}

module.exports = {
  checkWinner,
  isBoardFull,
  getMinimaxMove,
  getMinimaxMoveForPlayer
};
