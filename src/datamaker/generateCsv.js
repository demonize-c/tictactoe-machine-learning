const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { generateCsvFile } = require("./csvHelper");

const ACTION_CANCEL = "__CANCEL__";
const ACTION_QUIT = "__QUIT__";

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("generate:csv requires an interactive terminal (TTY).");
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

function renderSingleSelect(
  title,
  options,
  selectedIndex,
  { allowCancel = true, allowQuit = true, hint } = {}
) {
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

  let tail = "UP/DOWN: navigate, ENTER: confirm";
  if (allowCancel) {
    tail += ", C: cancel";
  }
  if (allowQuit) {
    tail += ", Q: quit";
  }
  console.log(tail);
}

function promptSingleSelect({
  title,
  options,
  allowCancel = true,
  allowQuit = true,
  hint
}) {
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
        renderSingleSelect(title, options, selectedIndex, { allowCancel, allowQuit, hint });
        return;
      }

      if (key && key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
        renderSingleSelect(title, options, selectedIndex, { allowCancel, allowQuit, hint });
        return;
      }

      if (key && key.name === "return") {
        done(selectedIndex);
        return;
      }

      if (allowCancel && key && key.name === "c") {
        done(ACTION_CANCEL);
        return;
      }

      if (allowQuit && key && (key.name === "q" || key.name === "escape")) {
        done(ACTION_QUIT);
      }
    }

    setupKeypress();
    process.stdin.on("keypress", onKeypress);
    renderSingleSelect(title, options, selectedIndex, { allowCancel, allowQuit, hint });
  });
}

function askLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function askWithDefault(question, defaultValue) {
  const suffix =
    defaultValue === ""
      ? " [optional]"
      : defaultValue !== undefined
        ? ` [${defaultValue}]`
        : "";

  const answer = await askLine(`${question}${suffix}: `);
  const trimmed = answer.trim();

  if (trimmed.length === 0 && defaultValue !== undefined) {
    return String(defaultValue);
  }

  return trimmed;
}

function askMenuChoice({ title, options, allowCancel = true, allowQuit = true, hint }) {
  return promptSingleSelect({ title, options, allowCancel, allowQuit, hint });
}

async function askInteger(question, defaultValue, minValue, maxValue) {
  while (true) {
    const raw = await askWithDefault(question, defaultValue);
    const value = Number(raw);
    const minOk = minValue === undefined || value >= minValue;
    const maxOk = maxValue === undefined || value <= maxValue;

    if (Number.isInteger(value) && minOk && maxOk) {
      return value;
    }

    if (minValue !== undefined && maxValue !== undefined) {
      console.log(`Enter an integer in range [${minValue}, ${maxValue}].`);
    } else if (minValue !== undefined) {
      console.log(`Enter an integer >= ${minValue}.`);
    } else {
      console.log("Enter a valid integer.");
    }
  }
}

async function askNumberRange(question, defaultValue, minValue, maxValue) {
  while (true) {
    const raw = await askWithDefault(question, defaultValue);
    const value = Number(raw);

    if (!Number.isNaN(value) && value >= minValue && value <= maxValue) {
      return value;
    }

    console.log(`Enter a number in range [${minValue}, ${maxValue}].`);
  }
}

function listExistingTrainingDataDirs(rootDir) {
  const datasetsDir = path.resolve(rootDir, "datasets");
  if (!fs.existsSync(datasetsDir)) {
    return [];
  }

  return fs
    .readdirSync(datasetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("training_data_"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function chooseTrainingDataMode() {
  const choice = await askMenuChoice({
    title: "Training data mode",
    options: [
      "new (create new training_data folder)",
      "existing (use existing folder)"
    ],
    allowCancel: true,
    allowQuit: true
  });

  if (choice === ACTION_CANCEL || choice === ACTION_QUIT) {
    return choice;
  }

  return choice === 0 ? "new" : "existing";
}

async function chooseExistingTrainingTarget(rootDir) {
  while (true) {
    const existingFolders = listExistingTrainingDataDirs(rootDir);
    const options = [...existingFolders, "Enter custom path/name"];

    const choice = await askMenuChoice({
      title: "Select existing training_data folder",
      options,
      allowCancel: true,
      allowQuit: true
    });

    if (choice === ACTION_CANCEL || choice === ACTION_QUIT) {
      return choice;
    }

    if (choice < existingFolders.length) {
      return {
        trainingDataName: existingFolders[choice],
        trainingDataDir: ""
      };
    }

    while (true) {
      const methodChoice = await askMenuChoice({
        title: "Custom existing target method",
        options: ["Use folder name", "Use directory path"],
        allowCancel: true,
        allowQuit: true
      });

      if (methodChoice === ACTION_QUIT) {
        return ACTION_QUIT;
      }

      if (methodChoice === ACTION_CANCEL) {
        break;
      }

      if (methodChoice === 0) {
        const rawName = await askWithDefault(
          "Existing training data folder name (e.g. training_data_demo_set)",
          "training_data_my_folder"
        );

        return {
          trainingDataName: rawName.trim(),
          trainingDataDir: ""
        };
      }

      const rawDir = await askWithDefault(
        "Existing training data directory path (relative or absolute)",
        path.join("datasets", "training_data_my_folder")
      );

      return {
        trainingDataName: "",
        trainingDataDir: rawDir.trim()
      };
    }
  }
}

async function collectConfig(rootDir) {
  console.log("\nGenerate CSV - Interactive Setup");

  const games = await askInteger("Number of games", 10, 1);
  const winnerMoves = await askInteger("Winner moves (3-5)", 3, 3, 5);
  const player1ModeChoice = await askMenuChoice({
    title: "Player1 move mode",
    options: ["smart (minmax moves)", "dumb (mixed with random moves)"],
    allowCancel: true,
    allowQuit: true
  });

  if (player1ModeChoice === ACTION_CANCEL) {
    return ACTION_CANCEL;
  }

  if (player1ModeChoice === ACTION_QUIT) {
    return ACTION_QUIT;
  }

  const player1Mode = player1ModeChoice === 0 ? "smart" : "dumb";
  const player1FirstRandomness = await askNumberRange(
    "Player1 first-move randomness throttle (0-1)",
    0,
    0,
    1
  );
  const player1OtherRandomness =
    player1Mode === "dumb"
      ? await askNumberRange(
          "Player1 other-moves randomness throttle (0-1)",
          0,
          0,
          1
        )
      : 0;
  const player2Randomness = await askNumberRange(
    "Player2 randomness throttle (0-1)",
    0.5,
    0,
    1
  );

  while (true) {
    const mode = await chooseTrainingDataMode();

    if (mode === ACTION_CANCEL) {
      return ACTION_CANCEL;
    }

    if (mode === ACTION_QUIT) {
      return ACTION_QUIT;
    }

    if (mode === "new") {
      const rawName = await askWithDefault(
        "New training data folder name",
        ""
      );

      return {
        games,
        winnerMoves,
        player2Randomness,
        player1FirstRandomness,
        player1OtherRandomness,
        player1Mode,
        trainingDataMode: "new",
        trainingDataName: rawName.trim(),
        trainingDataDir: ""
      };
    }

    const selected = await chooseExistingTrainingTarget(rootDir);

    if (selected === ACTION_CANCEL) {
      continue;
    }

    if (selected === ACTION_QUIT) {
      return ACTION_QUIT;
    }

    return {
      games,
      winnerMoves,
      player2Randomness,
      player1FirstRandomness,
      player1OtherRandomness,
      player1Mode,
      trainingDataMode: "existing",
      trainingDataName: selected.trainingDataName,
      trainingDataDir: selected.trainingDataDir
    };
  }
}

async function promptConfig(rootDir) {
  ensureInteractiveTerminal();

  while (true) {
    const topChoice = await askMenuChoice({
      title: "Generate CSV Wizard",
      options: ["Start generation"],
      allowCancel: false,
      allowQuit: true,
      hint: "UP/DOWN: navigate, ENTER: confirm, Q: quit"
    });

    if (topChoice === ACTION_QUIT) {
      return ACTION_QUIT;
    }

    const config = await collectConfig(rootDir);
    if (config === ACTION_CANCEL) {
      continue;
    }
    return config;
  }
}

function runGeneration(config) {
  const {
    csvRelativePath,
    logRelativePath,
    trainingDataRelativePath,
    requestedGames,
    requestedPlayer1First,
    requestedPlayer2First,
    availableUniqueGames,
    recordedGames,
    recordedPlayer1First,
    recordedPlayer2First
  } = generateCsvFile(config);

  console.log(`CSV created: ${csvRelativePath}`);
  console.log(`Logged in: ${logRelativePath}`);
  console.log(`Training data folder: ${trainingDataRelativePath}`);
  console.log(`Games requested: ${requestedGames}`);
  console.log(
    `Requested first-move split -> Player1: ${requestedPlayer1First}, Player2: ${requestedPlayer2First}`
  );
  console.log(`Unique games found: ${availableUniqueGames}`);
  console.log(`Games recorded: ${recordedGames}`);
  console.log(
    `Recorded first-move split -> Player1: ${recordedPlayer1First}, Player2: ${recordedPlayer2First}`
  );
  console.log(`Winner moves per game: ${config.winnerMoves}`);
  console.log("Mode: Minmax1 vs Minmax2 with mixed random moves for Player2");
  console.log("Start player mix: 50/50 Player1-first and Player2-first");
  console.log(
    `Player1 first-move randomness throttle: ${config.player1FirstRandomness}`
  );
  console.log(`Player1 mode: ${config.player1Mode}`);
  console.log(
    `Player1 other-moves randomness throttle: ${config.player1OtherRandomness}`
  );
  console.log(`Player2 randomness throttle: ${config.player2Randomness}`);
  console.log(`Training data mode: ${config.trainingDataMode}`);
}

promptConfig(process.cwd())
  .then((config) => {
    if (config === ACTION_QUIT) {
      console.log("Quit.");
      return;
    }
    runGeneration(config);
  })
  .catch((error) => {
    try {
      process.stdin.setRawMode(false);
    } catch (_error) {
      // ignore cleanup failure
    }
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
