const { EMPTY, PLAYER2, MINMAX, BOARD_SIZE } = require("./constants");
const {
  checkWinner,
  isBoardFull,
  getMinimaxMove,
  getMinimaxMoveForPlayer
} = require("./minimax");
const { getRandomPlayerMove } = require("./randomMove");

function getGameOutcome(board) {
  const winner = checkWinner(board);
  if (winner === MINMAX || winner === PLAYER2) {
    return "win";
  }
  if (isBoardFull(board)) {
    return "draw";
  }
  return "incomplete";
}

function getRandomFreeMove(board) {
  const freeMoves = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === EMPTY) {
      freeMoves.push(i);
    }
  }
  if (freeMoves.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * freeMoves.length);
  return freeMoves[randomIndex];
}

function getPlayer2BaseMove(board, player2Strategy, minmaxOptions) {
  if (player2Strategy === "random") {
    return getRandomPlayerMove(board);
  }
  return getMinimaxMoveForPlayer(board, PLAYER2, minmaxOptions);
}

function getPlayer2Move(board, player2Moves, options) {
  const minmaxOptions = {
    randomizeTies: options.minmaxRandomizeTies !== false
  };

  if (
    options.player2RandomMoveIndexes instanceof Set &&
    options.player2RandomMoveIndexes.has(player2Moves)
  ) {
    return getRandomPlayerMove(board);
  }

  const player2Strategy =
    options.player2Strategy === "random" ? "random" : "minmax";
  return getPlayer2BaseMove(board, player2Strategy, minmaxOptions);
}

function shouldUseRandomFirstMove(minmaxMoves, options) {
  if (minmaxMoves !== 0) {
    return false;
  }

  if (typeof options.minmaxFirstMoveRandomness === "number") {
    const chance = Math.max(0, Math.min(1, options.minmaxFirstMoveRandomness));
    return Math.random() < chance;
  }

  return options.diversifyMinmaxFirstMove === true;
}

function shouldUseRandomMinmaxMove(minmaxMoves, options) {
  if (minmaxMoves === 0) {
    return shouldUseRandomFirstMove(minmaxMoves, options);
  }

  return (
    options.player1RandomMoveIndexes instanceof Set &&
    options.player1RandomMoveIndexes.has(minmaxMoves)
  );
}

function simulateGame(maxMinmaxMoves, options = {}) {
  const startPlayer = options.startPlayer === "player2" ? "player2" : "minmax";
  const minmaxOptions = {
    randomizeTies: options.minmaxRandomizeTies !== false
  };
  const board = Array(BOARD_SIZE).fill(EMPTY);
  let minmaxMoves = 0;
  let player2Moves = 0;
  const turnRows = [];

  if (startPlayer === "player2" && getGameOutcome(board) === "incomplete") {
    const firstPlayer2Move = getPlayer2Move(board, player2Moves, options);
    if (firstPlayer2Move !== null) {
      board[firstPlayer2Move] = PLAYER2;
      player2Moves += 1;
    }
  }
  const initialBeforeMinmaxBoard = [...board];

  while (true) {
    if (getGameOutcome(board) !== "incomplete") {
      break;
    }
    if (minmaxMoves >= maxMinmaxMoves) {
      break;
    }

    const minmaxMove = shouldUseRandomMinmaxMove(minmaxMoves, options)
      ? getRandomFreeMove(board)
      : getMinimaxMove(board, minmaxOptions);

    if (minmaxMove === null) {
      break;
    }

    board[minmaxMove] = MINMAX;
    minmaxMoves += 1;

    const afterMinmaxBoard = [...board];
    let afterPlayer2Board = [...board];

    if (getGameOutcome(board) !== "incomplete") {
      turnRows.push({
        afterMinmaxBoard,
        afterPlayer2Board
      });
      break;
    }

    if (minmaxMoves >= maxMinmaxMoves) {
      turnRows.push({
        afterMinmaxBoard,
        afterPlayer2Board
      });
      break;
    }

    const player2Move = getPlayer2Move(board, player2Moves, options);
    if (player2Move === null) {
      turnRows.push({
        afterMinmaxBoard,
        afterPlayer2Board
      });
      break;
    }

    board[player2Move] = PLAYER2;
    player2Moves += 1;
    afterPlayer2Board = [...board];

    turnRows.push({
      afterMinmaxBoard,
      afterPlayer2Board
    });
  }

  return {
    board,
    outcome: getGameOutcome(board),
    turnRows,
    startPlayer,
    initialBeforeMinmaxBoard
  };
}

module.exports = {
  simulateGame
};
