const fs = require("fs");
const path = require("path");
const { BOARD_SIZE, MINMAX } = require("./constants");
const { simulateGame } = require("./simulateGame");
const { checkWinner } = require("./minimax");

function buildHeader() {
  const player2Cols = Array.from(
    { length: BOARD_SIZE },
    (_, i) => `player2_move_${i + 1}`
  );
  const player1Cols = Array.from(
    { length: BOARD_SIZE },
    (_, i) => `player1_move_${i + 1}`
  );
  return [...player2Cols, ...player1Cols];
}

function turnToCsvRow(beforePlayer1Board, afterPlayer1Board) {
  return [...beforePlayer1Board, ...afterPlayer1Board];
}

function boardsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function createGameSignature(turnRows) {
  return turnRows
    .map((turn) => [...turn.afterMinmaxBoard, ...turn.afterPlayer2Board].join(","))
    .join("|");
}

function clamp01(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function buildPlayer2RandomMoveIndexes({
  startPlayer,
  winnerMoves,
  maxPlayer2Moves,
  player2Randomness
}) {
  const randomness = clamp01(player2Randomness);
  if (maxPlayer2Moves <= 0 || randomness <= 0) {
    return new Set();
  }

  // Requested behavior:
  // - if Player1 starts -> target Player2 move number = winnerMoves
  // - else -> target Player2 move number = winnerMoves - 1
  const desiredMoveNumber =
    startPlayer === "minmax" ? winnerMoves : Math.max(1, winnerMoves - 1);
  const clampedMoveNumber = Math.max(1, Math.min(desiredMoveNumber, maxPlayer2Moves));

  if (Math.random() >= randomness) {
    return new Set();
  }

  return new Set([clampedMoveNumber - 1]);
}

function sampleRandomMoveCount(maxMoves, randomness) {
  if (maxMoves <= 0) {
    return 0;
  }

  const chance = clamp01(randomness);
  if (chance <= 0) {
    return 0;
  }
  if (chance >= 1) {
    return maxMoves;
  }

  let count = 0;
  for (let i = 0; i < maxMoves; i += 1) {
    if (Math.random() < chance) {
      count += 1;
    }
  }
  return count;
}

function buildPlayer1OtherRandomMoveIndexes(maxMinmaxMoves, player1OtherRandomness) {
  const otherMoves = Math.max(maxMinmaxMoves - 1, 0);
  const randomMoveCount = sampleRandomMoveCount(otherMoves, player1OtherRandomness);

  if (randomMoveCount === 0) {
    return new Set();
  }

  const slots = Array.from({ length: otherMoves }, (_, index) => index + 1);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return new Set(slots.slice(0, randomMoveCount));
}

function collectUniqueGames({
  targetCount,
  startPlayer,
  maxMinmaxMoves,
  baseMaxPlayer2Moves,
  winnerMoves,
  requirePlayer1NotLose,
  seenSignatures,
  maxDurationMs,
  player2Randomness,
  player1FirstRandomness,
  player1OtherRandomness
}) {
  const collected = [];
  const maxAttempts = Math.max(targetCount * 160, 1200);
  const maxStagnantAttempts = Math.max(targetCount * 50, 500);
  const startedAt = Date.now();
  let attempts = 0;
  let stagnantAttempts = 0;
  let drawStreak = 0;

  while (
    collected.length < targetCount &&
    attempts < maxAttempts &&
    stagnantAttempts < maxStagnantAttempts &&
    Date.now() - startedAt < maxDurationMs
  ) {
    attempts += 1;

    const maxPlayer2Moves =
      startPlayer === "player2" ? baseMaxPlayer2Moves + 1 : baseMaxPlayer2Moves;
    const player2RandomMoveIndexes = buildPlayer2RandomMoveIndexes({
      startPlayer,
      winnerMoves,
      maxPlayer2Moves,
      player2Randomness
    });
    const player1RandomMoveIndexes = buildPlayer1OtherRandomMoveIndexes(
      maxMinmaxMoves,
      player1OtherRandomness
    );

    const boostedFirstMoveRandomness =
      player1FirstRandomness > 0
        ? clamp01(player1FirstRandomness + drawStreak * 0.12)
        : 0;

    const { board, outcome, turnRows, initialBeforeMinmaxBoard } = simulateGame(
      maxMinmaxMoves,
      {
      startPlayer,
      minmaxRandomizeTies: !requirePlayer1NotLose,
      minmaxFirstMoveRandomness: boostedFirstMoveRandomness,
      player1RandomMoveIndexes,
      player2Strategy: "minmax",
      player2RandomMoveIndexes
      }
    );

    if (outcome === "incomplete") {
      stagnantAttempts += 1;
      continue;
    }

    if (requirePlayer1NotLose && outcome === "win") {
      const winner = checkWinner(board);
      if (winner !== MINMAX) {
        stagnantAttempts += 1;
        continue;
      }
    }

    if (outcome === "win") {
      const winner = checkWinner(board);
      const winnerMoveCount = board.filter((cell) => cell === winner).length;
      if (winnerMoveCount !== winnerMoves) {
        stagnantAttempts += 1;
        continue;
      }
    }

    const signature = createGameSignature(turnRows);
    if (seenSignatures.has(signature)) {
      stagnantAttempts += 1;
      continue;
    }

    seenSignatures.add(signature);
    collected.push({
      turnRows,
      startPlayer,
      initialBeforeMinmaxBoard
    });

    drawStreak = outcome === "draw" ? drawStreak + 1 : 0;
    stagnantAttempts = 0;
  }

  return collected;
}

function buildSeparatorRow(gameNumber) {
  const totalColumns = BOARD_SIZE * 2;
  const separator = Array(totalColumns).fill("");
  separator[0] = `GAME_${gameNumber}_END`;
  return separator;
}

function generateRandomCsvName() {
  const now = new Date();
  const isoBase = now.toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `tictactoe_${isoBase}_${rand}.csv`;
}

function normalizeTrainingDataName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("`training-data-name` must be a non-empty string.");
  }

  const cleaned = name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  if (cleaned.length === 0) {
    throw new Error(
      "`training-data-name` must contain letters, numbers, `_` or `-`."
    );
  }

  return cleaned.startsWith("training_data_")
    ? cleaned
    : `training_data_${cleaned}`;
}

function generateTrainingDataFolderName() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `training_data_${rand}`;
}

function resolveTrainingDataDir({
  rootDir,
  trainingDataMode,
  trainingDataDir,
  trainingDataName
}) {
  const datasetsDir = path.resolve(rootDir, "datasets");

  if (trainingDataMode === "existing") {
    if (trainingDataDir) {
      const resolved = path.resolve(rootDir, trainingDataDir);
      fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    }

    if (trainingDataName) {
      const normalized = normalizeTrainingDataName(trainingDataName);
      const resolved = path.resolve(datasetsDir, normalized);
      fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    }

    throw new Error(
      "For `training-data-mode=existing`, provide `training-data-dir` or `training-data-name`."
    );
  }

  fs.mkdirSync(datasetsDir, { recursive: true });

  const baseName = trainingDataName
    ? normalizeTrainingDataName(trainingDataName)
    : generateTrainingDataFolderName();

  let resolved = path.resolve(datasetsDir, baseName);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  // If user gave an existing name in "new" mode, create a unique sibling name.
  let suffix = 2;
  while (true) {
    const candidate = path.resolve(datasetsDir, `${baseName}_${suffix}`);
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate, { recursive: true });
      return candidate;
    }
    suffix += 1;
  }
}

function generateCsvFile({
  games,
  winnerMoves = 3,
  player2Randomness = 0.5,
  player1FirstRandomness = 0,
  player1OtherRandomness = 0,
  player1Mode = "smart",
  trainingDataMode = "new",
  trainingDataDir = "",
  trainingDataName = "",
  rootDir = process.cwd()
}) {
  if (
    !Number.isInteger(winnerMoves) ||
    winnerMoves < 3 ||
    winnerMoves > 5
  ) {
    throw new Error("`winner-moves` must be an integer from 3 to 5.");
  }

  if (
    typeof player2Randomness !== "number" ||
    Number.isNaN(player2Randomness) ||
    player2Randomness < 0 ||
    player2Randomness > 1
  ) {
    throw new Error("`player2-randomness` must be a number from 0 to 1.");
  }

  if (
    typeof player1FirstRandomness !== "number" ||
    Number.isNaN(player1FirstRandomness) ||
    player1FirstRandomness < 0 ||
    player1FirstRandomness > 1
  ) {
    throw new Error(
      "`player1-first-randomness` must be a number from 0 to 1."
    );
  }

  if (
    typeof player1OtherRandomness !== "number" ||
    Number.isNaN(player1OtherRandomness) ||
    player1OtherRandomness < 0 ||
    player1OtherRandomness > 1
  ) {
    throw new Error(
      "`player1-other-randomness` must be a number from 0 to 1."
    );
  }

  if (!["smart", "dumb"].includes(player1Mode)) {
    throw new Error("`player1-mode` must be either `smart` or `dumb`.");
  }

  if (!["new", "existing"].includes(trainingDataMode)) {
    throw new Error("`training-data-mode` must be either `new` or `existing`.");
  }

  const header = buildHeader();
  const rows = [];
  const selectedGames = [];
  const seenSignatures = new Set();
  const requirePlayer1NotLose = player1Mode === "smart";
  const effectivePlayer1OtherRandomness =
    player1Mode === "dumb" ? player1OtherRandomness : 0;
  const maxMinmaxMoves = 5;
  const baseMaxPlayer2Moves = Math.max(maxMinmaxMoves - 1, 0);
  const baseHalf = Math.floor(games / 2);
  const oddGoesToPlayer1 = games % 2 === 1 && Math.random() < 0.5 ? 1 : 0;
  const requestedPlayer1First = baseHalf + oddGoesToPlayer1;
  const requestedPlayer2First = games - requestedPlayer1First;
  const maxDurationMs = Math.max(games * 90, 7000);

  if (requestedPlayer1First > 0) {
    const player1FirstGames = collectUniqueGames({
      targetCount: requestedPlayer1First,
      startPlayer: "minmax",
      maxMinmaxMoves,
      baseMaxPlayer2Moves,
      winnerMoves,
      requirePlayer1NotLose,
      seenSignatures,
      maxDurationMs,
      player2Randomness,
      player1FirstRandomness,
      player1OtherRandomness: effectivePlayer1OtherRandomness
    });
    selectedGames.push(...player1FirstGames);
  }

  if (requestedPlayer2First > 0) {
    const player2FirstGames = collectUniqueGames({
      targetCount: requestedPlayer2First,
      startPlayer: "player2",
      maxMinmaxMoves,
      baseMaxPlayer2Moves,
      winnerMoves,
      requirePlayer1NotLose,
      seenSignatures,
      maxDurationMs,
      player2Randomness,
      player1FirstRandomness,
      player1OtherRandomness: effectivePlayer1OtherRandomness
    });
    selectedGames.push(...player2FirstGames);
  }

  let remainingNeeded = games - selectedGames.length;
  if (remainingNeeded > 0) {
    const fillPlayer1First = collectUniqueGames({
      targetCount: Math.ceil(remainingNeeded / 2),
      startPlayer: "minmax",
      maxMinmaxMoves,
      baseMaxPlayer2Moves,
      winnerMoves,
      requirePlayer1NotLose,
      seenSignatures,
      maxDurationMs: Math.max(maxDurationMs / 2, 2500),
      player2Randomness,
      player1FirstRandomness,
      player1OtherRandomness: effectivePlayer1OtherRandomness
    });
    selectedGames.push(...fillPlayer1First);
  }

  remainingNeeded = games - selectedGames.length;
  if (remainingNeeded > 0) {
    const fillPlayer2First = collectUniqueGames({
      targetCount: remainingNeeded,
      startPlayer: "player2",
      maxMinmaxMoves,
      baseMaxPlayer2Moves,
      winnerMoves,
      requirePlayer1NotLose,
      seenSignatures,
      maxDurationMs: Math.max(maxDurationMs / 2, 2500),
      player2Randomness,
      player1FirstRandomness,
      player1OtherRandomness: effectivePlayer1OtherRandomness
    });
    selectedGames.push(...fillPlayer2First);
  }

  for (let i = selectedGames.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectedGames[i], selectedGames[j]] = [selectedGames[j], selectedGames[i]];
  }

  const recordedGames = selectedGames.length;
  const availableUniqueGames = recordedGames;
  const recordedPlayer1First = selectedGames.filter(
    (game) => game.startPlayer === "minmax"
  ).length;
  const recordedPlayer2First = selectedGames.filter(
    (game) => game.startPlayer === "player2"
  ).length;

  for (let i = 0; i < selectedGames.length; i += 1) {
    const game = selectedGames[i];
    let beforePlayer1Board = Array.isArray(game.initialBeforeMinmaxBoard)
      ? [...game.initialBeforeMinmaxBoard]
      : Array(BOARD_SIZE).fill(0);

    for (const turn of game.turnRows) {
      rows.push(turnToCsvRow(beforePlayer1Board, turn.afterMinmaxBoard));
      beforePlayer1Board = [...turn.afterPlayer2Board];
    }

    // If game ended on Player2 move, append a closure row so stored game
    // does not look incomplete at CSV tail.
    const lastTurn = game.turnRows[game.turnRows.length - 1];
    if (
      lastTurn &&
      !boardsEqual(lastTurn.afterPlayer2Board, lastTurn.afterMinmaxBoard)
    ) {
      rows.push(
        turnToCsvRow(lastTurn.afterPlayer2Board, lastTurn.afterPlayer2Board)
      );
    }

    if (i < selectedGames.length - 1) {
      rows.push(buildSeparatorRow(i + 1));
    }
  }

  const csvLines = [header.join(","), ...rows.map((row) => row.join(","))];
  const csvContent = `${csvLines.join("\n")}\n`;

  const trainingDir = resolveTrainingDataDir({
    rootDir,
    trainingDataMode,
    trainingDataDir,
    trainingDataName
  });

  const csvName = generateRandomCsvName();
  const csvPath = path.resolve(trainingDir, csvName);
  fs.writeFileSync(csvPath, csvContent, "utf8");

  const logFileName = "records.txt";
  const logPath = path.resolve(trainingDir, logFileName);
  fs.appendFileSync(logPath, `${csvName}\n`, "utf8");

  return {
    csvRelativePath: path.relative(rootDir, csvPath),
    logRelativePath: path.relative(rootDir, logPath),
    trainingDataRelativePath: path.relative(rootDir, trainingDir),
    requestedGames: games,
    requestedPlayer1First,
    requestedPlayer2First,
    availableUniqueGames,
    recordedGames,
    recordedPlayer1First,
    recordedPlayer2First,
    player2Randomness,
    player1FirstRandomness,
    player1OtherRandomness: effectivePlayer1OtherRandomness,
    player1Mode
  };
}

module.exports = {
  generateCsvFile
};
