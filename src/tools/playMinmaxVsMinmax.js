const { EMPTY, MINMAX, PLAYER2, BOARD_SIZE } = require("../datamaker/constants");
const { checkWinner, isBoardFull, getMinimaxMove } = require("../datamaker/minimax");

function getRandomFreeMove(board) {
  const available = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === EMPTY) {
      available.push(i);
    }
  }

  if (available.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * available.length);
  return available[randomIndex];
}

function getMinimaxMoveForPlayer(board, player) {
  if (player === MINMAX) {
    return getMinimaxMove([...board]);
  }

  const mirroredBoard = board.map((cell) => {
    if (cell === EMPTY) {
      return EMPTY;
    }
    return cell * -1;
  });

  return getMinimaxMove(mirroredBoard);
}

function symbol(cell) {
  if (cell === MINMAX) {
    return "X";
  }
  if (cell === PLAYER2) {
    return "O";
  }
  return " ";
}

function renderBoard(board) {
  const s = (idx) => symbol(board[idx]);
  return [
    ` ${s(0)} | ${s(1)} | ${s(2)} `,
    "---+---+---",
    ` ${s(3)} | ${s(4)} | ${s(5)} `,
    "---+---+---",
    ` ${s(6)} | ${s(7)} | ${s(8)} `
  ].join("\n");
}

function playSingleGame() {
  const board = Array(BOARD_SIZE).fill(EMPTY);
  const moves = [];

  let currentPlayer = MINMAX;
  let minmax1MoveCount = 0;

  while (true) {
    let move = null;

    if (currentPlayer === MINMAX) {
      move =
        minmax1MoveCount === 0
          ? getRandomFreeMove(board)
          : getMinimaxMoveForPlayer(board, MINMAX);
      minmax1MoveCount += 1;
    } else {
      move = getMinimaxMoveForPlayer(board, PLAYER2);
    }

    if (move === null) {
      break;
    }

    board[move] = currentPlayer;
    moves.push({
      player: currentPlayer,
      move
    });

    const winner = checkWinner(board);
    if (winner !== EMPTY) {
      return {
        winner,
        board,
        moves
      };
    }

    if (isBoardFull(board)) {
      return {
        winner: EMPTY,
        board,
        moves
      };
    }

    currentPlayer = currentPlayer === MINMAX ? PLAYER2 : MINMAX;
  }

  return {
    winner: EMPTY,
    board,
    moves
  };
}

function parseArgs(argv) {
  const config = {
    games: 1
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--games" || token === "-g") {
      config.games = Number(next);
      i += 1;
      continue;
    }

    if (token.startsWith("--games=")) {
      config.games = Number(token.split("=")[1]);
      continue;
    }
  }

  if (!Number.isInteger(config.games) || config.games <= 0) {
    throw new Error("`games` must be a positive integer.");
  }

  return config;
}

function formatWinner(winner) {
  if (winner === MINMAX) {
    return "Minmax1 (X)";
  }
  if (winner === PLAYER2) {
    return "Player2 (O)";
  }
  return "Draw";
}

function main() {
  const { games } = parseArgs(process.argv.slice(2));
  const results = {
    minmax1: 0,
    minmax2: 0,
    draw: 0
  };

  for (let i = 0; i < games; i += 1) {
    const game = playSingleGame();

    if (game.winner === MINMAX) {
      results.minmax1 += 1;
    } else if (game.winner === PLAYER2) {
      results.minmax2 += 1;
    } else {
      results.draw += 1;
    }

    if (games === 1) {
      console.log("Minmax1 vs Minmax2");
      console.log("Minmax1 starts first.");
      console.log("Minmax1 first move is random.");
      console.log("");
      console.log(renderBoard(game.board));
      console.log("");
      console.log(`Result: ${formatWinner(game.winner)}`);
      console.log(
        `Moves: ${game.moves
          .map((entry, index) => `${index + 1}.${entry.player === MINMAX ? "X" : "O"}@${entry.move}`)
          .join(" ")}`
      );
    }
  }

  if (games > 1) {
    console.log(`Games played: ${games}`);
    console.log(`Minmax1 (X) wins: ${results.minmax1}`);
    console.log(`Player2 (O) wins: ${results.minmax2}`);
    console.log(`Draws: ${results.draw}`);
    console.log("Minmax1 starts first in every game.");
    console.log("Minmax1 first move is random in every game.");
  }
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
