const fs = require("fs");
const path = require("path");
const { encodeBoard } = require("./boardCodec");

function parseNumericCsvRow(line) {
  const cols = line.split(",");
  if (cols.length < 18) {
    return null;
  }

  if (/^GAME_\d+_END$/.test(cols[0].trim())) {
    return null;
  }

  const numeric = cols.slice(0, 18).map((value) => Number(value));
  if (numeric.some((value) => Number.isNaN(value))) {
    return null;
  }

  return numeric;
}

function isGameSeparator(line) {
  return /^GAME_\d+_END$/.test(line.split(",")[0].trim());
}

function pushSample(dataRows, inputBoard, outputBoard) {
  dataRows.push({
    input: encodeBoard(inputBoard),
    output: encodeBoard(outputBoard)
  });
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

function parseGamesFromLines(lines) {
  const games = [];
  let current = [];

  for (const line of lines) {
    if (isGameSeparator(line)) {
      if (current.length > 0) {
        games.push(current);
      }
      current = [];
      continue;
    }

    const row = parseNumericCsvRow(line);
    if (!row) {
      continue;
    }
    current.push(row);
  }

  if (current.length > 0) {
    games.push(current);
  }

  return games;
}

function loadCsvRows(csvPath) {
  const content = fs.readFileSync(csvPath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const isNewFormat = header[0] === "player2_move_1" && header[9] === "player1_move_1";
  const games = parseGamesFromLines(lines.slice(1));

  const dataRows = [];
  for (const gameRows of games) {
    if (isNewFormat) {
      // Row format: [before Player1 move, after Player1 move].
      for (let turn = 0; turn < gameRows.length; turn += 1) {
        const row = gameRows[turn];
        const beforePlayer1 = row.slice(0, 9);
        const afterPlayer1 = row.slice(9, 18);

        // Train only direct Player1 move transitions.
        if (!boardsEqual(beforePlayer1, afterPlayer1)) {
          pushSample(dataRows, beforePlayer1, afterPlayer1);
        }
      }
      continue;
    }

    // Legacy row format: [after Player1 move, after Player2 move].
    let previousPlayer2Board = Array(9).fill(0);
    for (const row of gameRows) {
      const afterPlayer1 = row.slice(0, 9);
      const afterPlayer2 = row.slice(9, 18);
      const beforePlayer1 = [...previousPlayer2Board];

      pushSample(dataRows, beforePlayer1, afterPlayer1);

      previousPlayer2Board = afterPlayer2;
    }
  }

  return dataRows;
}

function loadCsvPathsFromTxt(txtFilePath, rootDir) {
  const content = fs.readFileSync(txtFilePath, "utf8");
  const txtDir = path.dirname(txtFilePath);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const unique = new Set();
  const resolved = [];

  for (const entry of lines) {
    const candidates = [
      path.resolve(txtDir, entry),
      path.resolve(rootDir, entry)
    ];
    const absPath = candidates.find(
      (candidate) =>
        fs.existsSync(candidate) &&
        path.extname(candidate).toLowerCase() === ".csv"
    );

    if (!absPath) {
      continue;
    }

    if (unique.has(absPath)) {
      continue;
    }

    unique.add(absPath);
    resolved.push(absPath);
  }

  return resolved;
}

module.exports = {
  loadCsvRows,
  loadCsvPathsFromTxt
};
