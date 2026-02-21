const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  choosePlayer1Move,
  choosePlayer2Move,
  loadModel
} = require("../model/runtime");

const ACTION_QUIT = "__QUIT__";

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

function parseArgs(argv) {
  const config = {
    modelPath: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--model") {
      config.modelPath = path.resolve(process.cwd(), String(next));
      i += 1;
      continue;
    }

    if (token.startsWith("--model=")) {
      config.modelPath = path.resolve(process.cwd(), token.split("=")[1]);
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return config;
}

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("play:game requires an interactive terminal (TTY).");
  }
}

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function setupKeypress() {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
}

function cleanupKeypress(onKeypress) {
  process.stdin.removeListener("keypress", onKeypress);
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

function renderSingleSelect(title, options, selectedIndex, { hint } = {}) {
  clearScreen();
  console.log(title);
  console.log("");

  options.forEach((option, idx) => {
    const marker = idx === selectedIndex ? ">" : " ";
    console.log(`${marker} ${option}`);
  });

  console.log("");
  if (hint) {
    console.log(hint);
    return;
  }

  console.log("UP/DOWN: navigate, ENTER: confirm, Q: quit");
}

function promptSingleSelect({ title, options, hint }) {
  return new Promise((resolve) => {
    let selectedIndex = 0;

    function done(value) {
      cleanupKeypress(onKeypress);
      clearScreen();
      resolve(value);
    }

    function onKeypress(_str, key) {
      if (key && key.ctrl && key.name === "c") {
        done(ACTION_QUIT);
        return;
      }

      if (key && key.name === "up") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        renderSingleSelect(title, options, selectedIndex, { hint });
        return;
      }

      if (key && key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
        renderSingleSelect(title, options, selectedIndex, { hint });
        return;
      }

      if (key && key.name === "return") {
        done(selectedIndex);
        return;
      }

      if (key && (key.name === "q" || key.name === "escape")) {
        done(ACTION_QUIT);
      }
    }

    setupKeypress();
    process.stdin.on("keypress", onKeypress);
    renderSingleSelect(title, options, selectedIndex, { hint });
  });
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.resolve(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function listAvailableModels(rootDir) {
  const modelsDir = path.resolve(rootDir, "model", "models");
  const legacyModelDir = path.resolve(rootDir, "model");

  const all = [...listJsonFiles(modelsDir), ...listJsonFiles(legacyModelDir)];
  return [...new Set(all)];
}

async function chooseModelPath(rootDir) {
  const modelPaths = listAvailableModels(rootDir);
  if (modelPaths.length === 0) {
    throw new Error(
      "No model .json files found in model/models or model. Train a model first with npm run train:model."
    );
  }

  const options = modelPaths.map((filePath) => path.relative(rootDir, filePath));
  const choice = await promptSingleSelect({
    title: "Choose Trained Model",
    options,
    hint: "UP/DOWN: navigate, ENTER: confirm, Q: quit"
  });

  if (choice === ACTION_QUIT) {
    return ACTION_QUIT;
  }

  return modelPaths[choice];
}

async function chooseFirstPlayer() {
  const choice = await promptSingleSelect({
    title: "Who Moves First?",
    options: ["You first (O)", "Model first (O)"],
    hint: "UP/DOWN: navigate, ENTER: confirm, Q: quit"
  });

  if (choice === ACTION_QUIT) {
    return ACTION_QUIT;
  }

  return choice === 0 ? "human" : "model";
}

async function promptGameSetup(rootDir, modelPathFromArgs) {
  const selectedModelPath = modelPathFromArgs
    ? path.resolve(rootDir, modelPathFromArgs)
    : await chooseModelPath(rootDir);

  if (selectedModelPath === ACTION_QUIT) {
    return ACTION_QUIT;
  }

  if (!fs.existsSync(selectedModelPath)) {
    throw new Error(`Model file not found: ${selectedModelPath}`);
  }

  const firstPlayer = await chooseFirstPlayer();
  if (firstPlayer === ACTION_QUIT) {
    return ACTION_QUIT;
  }

  return {
    modelPath: selectedModelPath,
    firstPlayer
  };
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== 0 && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return 0;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== 0);
}

function symbol(value) {
  if (value === 1) {
    return "X";
  }
  if (value === -1) {
    return "O";
  }
  return " ";
}

function renderBoard(board) {
  const slots = board.map((cell, index) => {
    if (cell === 0) {
      return String(index + 1);
    }
    return symbol(cell);
  });

  return [
    ` ${slots[0]} | ${slots[1]} | ${slots[2]} `,
    "---+---+---",
    ` ${slots[3]} | ${slots[4]} | ${slots[5]} `,
    "---+---+---",
    ` ${slots[6]} | ${slots[7]} | ${slots[8]} `
  ].join("\n");
}

function printBoard(board) {
  console.log("");
  console.log(renderBoard(board));
  console.log("");
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return {
    ask(question) {
      return new Promise((resolve) => rl.question(question, resolve));
    },
    close() {
      rl.close();
    }
  };
}

async function askHumanMove(prompt, board) {
  while (true) {
    const answer = (await prompt.ask("Your move (1-9, or q to quit): ")).trim();

    if (answer.toLowerCase() === "q") {
      return null;
    }

    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) {
      console.log("Invalid input. Choose a number from 1 to 9.");
      continue;
    }

    if (board[idx] !== 0) {
      console.log("That position is already occupied.");
      continue;
    }

    return idx;
  }
}

async function main() {
  ensureInteractiveTerminal();

  const args = parseArgs(process.argv.slice(2));
  const setup = await promptGameSetup(process.cwd(), args.modelPath);
  if (setup === ACTION_QUIT) {
    console.log("Quit.");
    return;
  }

  const { modelPath, firstPlayer } = setup;
  const { net, metadata } = loadModel(modelPath);

  if (metadata) {
    console.log(`Loaded model: ${path.relative(process.cwd(), modelPath)}`);
    console.log(`Training rows: ${metadata.trainingRows}`);
  } else {
    console.log(`Loaded model: ${path.relative(process.cwd(), modelPath)}`);
  }

  const humanMarker = firstPlayer === "human" ? -1 : 1;
  const modelMarker = firstPlayer === "model" ? -1 : 1;
  const humanSymbol = humanMarker === -1 ? "O" : "X";
  const modelSymbol = modelMarker === -1 ? "O" : "X";

  console.log(`You are ${humanSymbol}. Model is ${modelSymbol}.`);
  console.log("First mover is always O.\n");
  console.log(firstPlayer === "human" ? "First move: You\n" : "First move: Model\n");

  const board = Array(9).fill(0);
  const prompt = createPrompt();
  let currentPlayer = firstPlayer;

  try {
    printBoard(board);

    while (true) {
      if (currentPlayer === "human") {
        const humanMove = await askHumanMove(prompt, board);
        if (humanMove === null) {
          console.log("Game ended by user.");
          return;
        }
        board[humanMove] = humanMarker;
      } else {
        const modelMove =
          modelMarker === -1
            ? choosePlayer2Move(board, net)
            : choosePlayer1Move(board, net);
        if (modelMove === null) {
          printBoard(board);
          console.log("Draw.");
          return;
        }

        board[modelMove] = modelMarker;
        console.log(`Model played: ${modelMove + 1}`);
      }

      printBoard(board);

      const winner = checkWinner(board);
      if (winner !== 0) {
        console.log(winner === humanMarker ? "You win." : "Model wins.");
        return;
      }
      if (isBoardFull(board)) {
        console.log("Draw.");
        return;
      }

      currentPlayer = currentPlayer === "human" ? "model" : "human";
    }
  } finally {
    prompt.close();
  }
}

main().catch((error) => {
  try {
    process.stdin.setRawMode(false);
  } catch (_error) {
    // ignore cleanup failure
  }
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
