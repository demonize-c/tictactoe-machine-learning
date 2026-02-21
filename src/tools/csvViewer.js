const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { WIN_LINES, EMPTY, MINMAX, PLAYER2 } = require("../datamaker/constants");

const DATASETS_DIR = path.resolve(process.cwd(), "datasets");
const LEGACY_CSV_DIR = path.resolve(DATASETS_DIR, "csv");

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CSV viewer requires an interactive terminal (TTY).");
  }
}

function listCsvFolders() {
  if (!fs.existsSync(DATASETS_DIR)) {
    return [];
  }

  const folders = fs
    .readdirSync(DATASETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("training_data_"))
    .map((entry) => ({
      label: entry.name,
      dirPath: path.resolve(DATASETS_DIR, entry.name)
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (fs.existsSync(LEGACY_CSV_DIR)) {
    folders.push({
      label: "csv (legacy)",
      dirPath: LEGACY_CSV_DIR
    });
  }

  return folders;
}

function listCsvFiles(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  return fs
    .readdirSync(folderPath)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => {
      const fullPath = path.resolve(folderPath, name);
      return {
        name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function parseNumericRow(row) {
  const cells = row.split(",");
  if (cells.length < 18) {
    return null;
  }

  const numeric = cells.slice(0, 18).map((value) => Number(value));
  if (numeric.some((value) => Number.isNaN(value))) {
    return null;
  }

  return numeric;
}

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

function getOutcome(board) {
  const winner = checkWinner(board);
  if (winner === MINMAX) {
    return "Player1 Win";
  }
  if (winner === PLAYER2) {
    return "Player2 Win";
  }
  if (isBoardFull(board)) {
    return "Draw";
  }
  return "Incomplete";
}

function finalizeGame(gameRows, games, isNewFormat) {
  if (gameRows.length === 0) {
    return;
  }

  const turnRows = [];
  if (isNewFormat) {
    for (let i = 0; i < gameRows.length; i += 1) {
      const row = gameRows[i];
      turnRows.push({
        beforePlayer1Board: row.slice(0, 9),
        afterPlayer1Board: row.slice(9, 18),
        afterPlayer2Board:
          i + 1 < gameRows.length ? gameRows[i + 1].slice(0, 9) : row.slice(9, 18)
      });
    }
  } else {
    let previousPlayer2Board = Array(9).fill(EMPTY);
    for (const row of gameRows) {
      const afterPlayer1Board = row.slice(0, 9);
      const afterPlayer2Board = row.slice(9, 18);
      turnRows.push({
        beforePlayer1Board: [...previousPlayer2Board],
        afterPlayer1Board,
        afterPlayer2Board
      });
      previousPlayer2Board = afterPlayer2Board;
    }
  }

  let finalBoard = [...turnRows[turnRows.length - 1].afterPlayer2Board];
  let outcome = getOutcome(finalBoard);

  for (const turn of turnRows) {
    const afterPlayer1Outcome = getOutcome(turn.afterPlayer1Board);
    if (afterPlayer1Outcome !== "Incomplete") {
      finalBoard = [...turn.afterPlayer1Board];
      outcome = afterPlayer1Outcome;
      break;
    }

    const afterPlayer2Outcome = getOutcome(turn.afterPlayer2Board);
    if (afterPlayer2Outcome !== "Incomplete") {
      finalBoard = [...turn.afterPlayer2Board];
      outcome = afterPlayer2Outcome;
      break;
    }
  }

  games.push({
    gameNumber: games.length + 1,
    turns: turnRows.length,
    turnRows,
    finalBoard,
    outcome
  });
}

function parseCompletedGames(csvPath) {
  const content = fs.readFileSync(csvPath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const isNewFormat = header[0] === "player2_move_1" && header[9] === "player1_move_1";
  const dataLines = lines.slice(1);
  const games = [];
  let currentRows = [];

  for (const line of dataLines) {
    const firstCell = line.split(",")[0].trim();
    if (/^GAME_\d+_END$/.test(firstCell)) {
      finalizeGame(currentRows, games, isNewFormat);
      currentRows = [];
      continue;
    }

    const numericRow = parseNumericRow(line);
    if (!numericRow) {
      continue;
    }

    currentRows.push(numericRow);
  }

  finalizeGame(currentRows, games, isNewFormat);
  return games;
}

function symbol(value) {
  if (value === MINMAX) {
    return "X";
  }
  if (value === PLAYER2) {
    return "O";
  }
  return " ";
}

function renderBoard(board) {
  const s = (index) => symbol(board[index]);
  return [
    ` ${s(0)} | ${s(1)} | ${s(2)} `,
    "---+---+---",
    ` ${s(3)} | ${s(4)} | ${s(5)} `,
    "---+---+---",
    ` ${s(6)} | ${s(7)} | ${s(8)} `
  ].join("\n");
}

function renderFolderPicker(folders, selectedFolderIndex) {
  clearScreen();
  console.log("CSV Viewer");
  console.log(`Datasets: ${DATASETS_DIR}`);
  console.log("");
  console.log("Select folder: UP/DOWN, ENTER. Quit: Q");
  console.log("");

  if (folders.length === 0) {
    console.log("No training_data folders or legacy csv folder found.");
    return;
  }

  folders.forEach((folder, idx) => {
    const prefix = idx === selectedFolderIndex ? ">" : " ";
    console.log(`${prefix} ${folder.label}`);
  });
}

function renderFilePicker(selectedFolder, files, selectedFileIndex) {
  clearScreen();
  console.log("CSV Viewer");
  console.log(`Folder: ${selectedFolder.label}`);
  console.log(`Path: ${path.relative(process.cwd(), selectedFolder.dirPath)}`);
  console.log("");
  console.log("Select file: UP/DOWN, ENTER. Back: B. Quit: Q");
  console.log("");

  if (files.length === 0) {
    console.log("No CSV files found in this folder.");
    return;
  }

  files.forEach((file, idx) => {
    const prefix = idx === selectedFileIndex ? ">" : " ";
    console.log(`${prefix} ${file.name}`);
  });
}

function renderGameView(selectedFile, games, gameIndex) {
  clearScreen();
  const game = games[gameIndex];

  console.log("CSV Viewer");
  console.log(`File: ${selectedFile.name}`);
  console.log(`Game: ${gameIndex + 1}/${games.length} (Recorded #${game.gameNumber})`);
  console.log(`Outcome: ${game.outcome}`);
  console.log(`Turns: ${game.turns}`);
  console.log("");
  console.log(renderBoard(game.finalBoard));
  console.log("");
  console.log("Legend: X = Player1 (1), O = Player2 (-1), blank = Empty (0)");
  console.log("LEFT/RIGHT or UP/DOWN: previous/next game");
  console.log("R: replay moves, B: back to file list, Q: quit");
}

function buildReplayFrames(game) {
  const frames = [];

  if (game.turnRows.length > 0) {
    frames.push({
      label: "Before Turn 1 (After Player2)",
      board: [...game.turnRows[0].beforePlayer1Board]
    });
  } else {
    frames.push({
      label: "Start (Empty Board)",
      board: Array(9).fill(EMPTY)
    });
  }

  for (let i = 0; i < game.turnRows.length; i += 1) {
    const turn = game.turnRows[i];
    frames.push({
      label: `Turn ${i + 1}: After Player1`,
      board: [...turn.afterPlayer1Board]
    });

    const player2Changed = turn.afterPlayer2Board.some(
      (value, idx) => value !== turn.afterPlayer1Board[idx]
    );
    if (player2Changed) {
      frames.push({
        label: `Turn ${i + 1}: After Player2`,
        board: [...turn.afterPlayer2Board]
      });
    }
  }

  return frames;
}

function renderReplayView(selectedFile, games, gameIndex, replayFrames, frameIndex, isPlaying) {
  clearScreen();
  const game = games[gameIndex];
  const frame = replayFrames[frameIndex];

  console.log("CSV Viewer - Replay");
  console.log(`File: ${selectedFile.name}`);
  console.log(`Game: ${gameIndex + 1}/${games.length} (Recorded #${game.gameNumber})`);
  console.log(`Outcome: ${game.outcome}`);
  console.log(`Frame: ${frameIndex + 1}/${replayFrames.length}`);
  console.log(`Step: ${frame.label}`);
  console.log(`Playback: ${isPlaying ? "Running" : "Paused"}`);
  console.log("");
  console.log(renderBoard(frame.board));
  console.log("");
  console.log("Legend: X = Player1 (1), O = Player2 (-1), blank = Empty (0)");
  console.log("LEFT/RIGHT: prev/next frame");
  console.log("R or SPACE: play/pause replay");
  console.log("B: back to game view, Q: quit");
}

function runViewer() {
  ensureInteractiveTerminal();

  const folders = listCsvFolders();
  let mode = "folder-select";
  let selectedFolderIndex = 0;
  let selectedFolder = null;
  let files = [];
  let selectedFileIndex = 0;
  let selectedFile = null;
  let selectedGameIndex = 0;
  let selectedGames = [];
  let replayFrames = [];
  let replayFrameIndex = 0;
  let replayTimer = null;
  let replayPlaying = false;
  const gameCache = new Map();

  function stopReplayTimer() {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    replayPlaying = false;
  }

  function renderCurrentReplayFrame() {
    renderReplayView(
      selectedFile,
      selectedGames,
      selectedGameIndex,
      replayFrames,
      replayFrameIndex,
      replayPlaying
    );
  }

  function startReplayTimer() {
    stopReplayTimer();
    replayPlaying = true;
    replayTimer = setInterval(() => {
      if (mode !== "game-replay") {
        stopReplayTimer();
        return;
      }
      if (replayFrameIndex >= replayFrames.length - 1) {
        stopReplayTimer();
        renderCurrentReplayFrame();
        return;
      }
      replayFrameIndex += 1;
      renderCurrentReplayFrame();
    }, 2000);
  }

  function openReplayForCurrentGame() {
    replayFrames = buildReplayFrames(selectedGames[selectedGameIndex]);
    replayFrameIndex = 0;
    mode = "game-replay";
    renderCurrentReplayFrame();
    startReplayTimer();
  }

  function closeAndExit(code = 0) {
    stopReplayTimer();
    try {
      process.stdin.setRawMode(false);
    } catch (_error) {
      // ignore cleanup failure
    }
    process.stdin.pause();
    process.exit(code);
  }

  function openSelectedFolder() {
    if (folders.length === 0) {
      return;
    }

    selectedFolder = folders[selectedFolderIndex];
    files = listCsvFiles(selectedFolder.dirPath);
    selectedFileIndex = 0;
    mode = "file-select";
    renderFilePicker(selectedFolder, files, selectedFileIndex);
  }

  function openSelectedFile() {
    if (files.length === 0) {
      return;
    }

    selectedFile = files[selectedFileIndex];
    if (!gameCache.has(selectedFile.fullPath)) {
      gameCache.set(selectedFile.fullPath, parseCompletedGames(selectedFile.fullPath));
    }

    selectedGames = gameCache.get(selectedFile.fullPath);
    selectedGameIndex = 0;

    if (selectedGames.length === 0) {
      clearScreen();
      console.log(`File: ${selectedFile.name}`);
      console.log("");
      console.log("No completed games found in this CSV.");
      console.log("Press B to go back, Q to quit.");
      mode = "empty-game-list";
      return;
    }

    stopReplayTimer();
    mode = "game-view";
    renderGameView(selectedFile, selectedGames, selectedGameIndex);
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on("keypress", (_str, key) => {
    if (!key) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      closeAndExit(0);
      return;
    }

    if (mode === "folder-select") {
      if (key.name === "q" || key.name === "escape") {
        closeAndExit(0);
        return;
      }
      if (key.name === "up" && folders.length > 0) {
        selectedFolderIndex = (selectedFolderIndex - 1 + folders.length) % folders.length;
        renderFolderPicker(folders, selectedFolderIndex);
        return;
      }
      if (key.name === "down" && folders.length > 0) {
        selectedFolderIndex = (selectedFolderIndex + 1) % folders.length;
        renderFolderPicker(folders, selectedFolderIndex);
        return;
      }
      if (key.name === "return" || key.name === "right") {
        openSelectedFolder();
        return;
      }
      return;
    }

    if (mode === "file-select") {
      if (key.name === "q" || key.name === "escape") {
        closeAndExit(0);
        return;
      }
      if (key.name === "b" || key.name === "left" || key.name === "backspace") {
        mode = "folder-select";
        renderFolderPicker(folders, selectedFolderIndex);
        return;
      }
      if (key.name === "up" && files.length > 0) {
        selectedFileIndex = (selectedFileIndex - 1 + files.length) % files.length;
        renderFilePicker(selectedFolder, files, selectedFileIndex);
        return;
      }
      if (key.name === "down" && files.length > 0) {
        selectedFileIndex = (selectedFileIndex + 1) % files.length;
        renderFilePicker(selectedFolder, files, selectedFileIndex);
        return;
      }
      if (key.name === "return" || key.name === "right") {
        openSelectedFile();
      }
      return;
    }

    if (mode === "empty-game-list") {
      if (key.name === "q" || key.name === "escape") {
        closeAndExit(0);
        return;
      }
      if (key.name === "b" || key.name === "left" || key.name === "backspace") {
        mode = "file-select";
        renderFilePicker(selectedFolder, files, selectedFileIndex);
      }
      return;
    }

    if (mode === "game-view") {
      if (key.name === "q" || key.name === "escape") {
        closeAndExit(0);
        return;
      }
      if (key.name === "b" || key.name === "backspace") {
        mode = "file-select";
        renderFilePicker(selectedFolder, files, selectedFileIndex);
        return;
      }
      if (key.name === "left" || key.name === "up") {
        selectedGameIndex =
          (selectedGameIndex - 1 + selectedGames.length) % selectedGames.length;
        renderGameView(selectedFile, selectedGames, selectedGameIndex);
        return;
      }
      if (key.name === "right" || key.name === "down") {
        selectedGameIndex = (selectedGameIndex + 1) % selectedGames.length;
        renderGameView(selectedFile, selectedGames, selectedGameIndex);
        return;
      }
      if (key.name === "r") {
        openReplayForCurrentGame();
      }
      return;
    }

    if (mode === "game-replay") {
      if (key.name === "q" || key.name === "escape") {
        closeAndExit(0);
        return;
      }
      if (key.name === "b" || key.name === "backspace") {
        stopReplayTimer();
        mode = "game-view";
        renderGameView(selectedFile, selectedGames, selectedGameIndex);
        return;
      }
      if (key.name === "left" || key.name === "up") {
        stopReplayTimer();
        replayFrameIndex =
          (replayFrameIndex - 1 + replayFrames.length) % replayFrames.length;
        renderCurrentReplayFrame();
        return;
      }
      if (key.name === "right" || key.name === "down") {
        stopReplayTimer();
        replayFrameIndex = (replayFrameIndex + 1) % replayFrames.length;
        renderCurrentReplayFrame();
        return;
      }
      if (key.name === "r" || key.name === "space") {
        if (replayPlaying) {
          stopReplayTimer();
          renderCurrentReplayFrame();
          return;
        }
        if (replayFrameIndex >= replayFrames.length - 1) {
          replayFrameIndex = 0;
        }
        renderCurrentReplayFrame();
        startReplayTimer();
      }
    }
  });

  renderFolderPicker(folders, selectedFolderIndex);
}

runViewer();
