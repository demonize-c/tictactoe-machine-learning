const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { NeuralNetwork } = require("brain.js");
const { loadCsvRows, loadCsvPathsFromTxt } = require("./trainDataLoader");

const ACTION_CANCEL = "__CANCEL__";
const ACTION_QUIT = "__QUIT__";

function parseHiddenLayers(raw) {
  const layers = raw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);

  if (layers.length === 0) {
    throw new Error("Hidden layers must look like: 27,18");
  }

  return layers;
}

function listTrainingRecordsFiles(rootDir) {
  const datasetsDir = path.resolve(rootDir, "datasets");
  const items = [];

  if (!fs.existsSync(datasetsDir)) {
    return items;
  }

  const trainingDirs = fs
    .readdirSync(datasetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("training_data_"));

  for (const dir of trainingDirs) {
    const recordsPath = path.resolve(datasetsDir, dir.name, "records.txt");
    if (!fs.existsSync(recordsPath)) {
      continue;
    }

    items.push({
      label: `${dir.name}/records.txt`,
      recordsPath,
      mtimeMs: fs.statSync(recordsPath).mtimeMs
    });
  }

  const legacyPath = path.resolve(datasetsDir, "created_csv_files.txt");
  if (fs.existsSync(legacyPath)) {
    items.push({
      label: "created_csv_files.txt (legacy)",
      recordsPath: legacyPath,
      mtimeMs: fs.statSync(legacyPath).mtimeMs
    });
  }

  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items;
}

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("train:model requires an interactive terminal (TTY).");
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
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : "";
  const raw = await askLine(`${question}${suffix}: `);
  const value = raw.trim();
  if (value.length === 0 && defaultValue !== undefined) {
    return String(defaultValue);
  }
  return value;
}

function askMenuChoice({ title, options, allowCancel = true, allowQuit = true, hint }) {
  return promptSingleSelect({ title, options, allowCancel, allowQuit, hint });
}

async function askInteger(question, defaultValue, minValue) {
  while (true) {
    const value = await askWithDefault(question, defaultValue);
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= minValue) {
      return parsed;
    }
    console.log(`Enter an integer >= ${minValue}.`);
  }
}

async function askNumberRange(question, defaultValue, minValue, maxValue) {
  while (true) {
    const value = await askWithDefault(question, defaultValue);
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && parsed >= minValue && parsed <= maxValue) {
      return parsed;
    }
    console.log(`Enter a number in range [${minValue}, ${maxValue}].`);
  }
}

async function askHiddenLayers(defaultLayers) {
  while (true) {
    const raw = await askWithDefault(
      "Hidden layers (comma-separated)",
      defaultLayers.join(",")
    );

    try {
      return parseHiddenLayers(raw);
    } catch (error) {
      console.log(error.message);
    }
  }
}

async function askModelName(defaultName) {
  while (true) {
    const raw = await askWithDefault("Model name", defaultName);
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      return defaultName;
    }

    if (trimmed.includes("/") || trimmed.includes("\\")) {
      console.log("Enter model name only (no path separators).");
      continue;
    }

    const normalized = trimmed.endsWith(".json")
      ? trimmed.slice(0, -5).trim()
      : trimmed;

    if (!normalized || normalized === "." || normalized === "..") {
      console.log("Enter a valid model name.");
      continue;
    }

    if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
      console.log("Model name can use letters, numbers, dot, underscore, and hyphen.");
      continue;
    }

    return normalized;
  }
}

async function chooseRecordsFile(rootDir) {
  while (true) {
    const options = listTrainingRecordsFiles(rootDir);
    const labels = options.map((opt) => path.relative(rootDir, opt.recordsPath));
    labels.push("Custom records.txt path");

    const choice = await askMenuChoice({
      title: "Select records source",
      options: labels,
      allowCancel: true,
      allowQuit: true
    });

    if (choice === ACTION_CANCEL || choice === ACTION_QUIT) {
      return choice;
    }

    if (choice < options.length) {
      return options[choice].recordsPath;
    }

    while (true) {
      const custom = await askWithDefault(
        "Enter records.txt path",
        path.join("datasets", "created_csv_files.txt")
      );

      const resolved = path.resolve(rootDir, custom);
      if (fs.existsSync(resolved)) {
        return resolved;
      }

      console.log(`File not found: ${resolved}`);
      const retryChoice = await askMenuChoice({
        title: "Custom records path",
        options: ["Try again"],
        allowCancel: true,
        allowQuit: true
      });

      if (retryChoice === ACTION_CANCEL) {
        break;
      }

      if (retryChoice === ACTION_QUIT) {
        return ACTION_QUIT;
      }
    }
  }
}

async function collectConfig(rootDir) {
  console.log("\nTrain Model - Interactive Setup");

  const listFile = await chooseRecordsFile(rootDir);
  if (listFile === ACTION_CANCEL || listFile === ACTION_QUIT) {
    return listFile;
  }

  const modelName = await askModelName("trained_model");

  const iterations = await askInteger("Iterations", 12000, 1);
  const errorThresh = await askNumberRange(
    "Error threshold",
    0.0025,
    0.000001,
    0.999999
  );
  const learningRate = await askNumberRange(
    "Learning rate",
    0.15,
    0.000001,
    1
  );
  const hiddenLayers = await askHiddenLayers([27, 18]);
  const logEvery = await askInteger("Log every N iterations", 200, 1);

  return {
    listFile,
    modelOut: path.resolve(rootDir, "model", "models", `${modelName}.json`),
    iterations,
    errorThresh,
    learningRate,
    hiddenLayers,
    logEvery
  };
}

async function promptConfig(rootDir) {
  ensureInteractiveTerminal();

  while (true) {
    const topChoice = await askMenuChoice({
      title: "Train Model Wizard",
      options: ["Start training"],
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

function main(config) {
  const csvPaths = loadCsvPathsFromTxt(config.listFile, process.cwd());

  if (csvPaths.length === 0) {
    throw new Error("No valid CSV files found in the selected records.txt.");
  }

  const dataset = [];
  for (const csvPath of csvPaths) {
    const rows = loadCsvRows(csvPath);
    dataset.push(...rows);
  }

  if (dataset.length === 0) {
    throw new Error("No trainable rows found in referenced CSV files.");
  }

  const net = new NeuralNetwork({
    hiddenLayers: config.hiddenLayers,
    activation: "sigmoid"
  });

  console.log(`\nCSV files loaded: ${csvPaths.length}`);
  console.log(`Training rows: ${dataset.length}`);
  console.log(`Hidden layers: ${config.hiddenLayers.join(",")}`);

  const trainStats = net.train(dataset, {
    iterations: config.iterations,
    errorThresh: config.errorThresh,
    learningRate: config.learningRate,
    log: (stats) => console.log(stats),
    logPeriod: config.logEvery
  });

  const outputDir = path.dirname(config.modelOut);
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    metadata: {
      createdAt: new Date().toISOString(),
      listFile: path.relative(process.cwd(), config.listFile),
      csvFilesUsed: csvPaths.map((p) => path.relative(process.cwd(), p)),
      trainingRows: dataset.length,
      hiddenLayers: config.hiddenLayers,
      iterationsRequested: config.iterations,
      errorThresh: config.errorThresh,
      learningRate: config.learningRate,
      trainResult: trainStats
    },
    model: net.toJSON()
  };

  fs.writeFileSync(config.modelOut, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Model saved: ${path.relative(process.cwd(), config.modelOut)}`);
  console.log(`Final error: ${trainStats.error}`);
  console.log(`Iterations used: ${trainStats.iterations}`);
}

promptConfig(process.cwd())
  .then((config) => {
    if (config === ACTION_QUIT) {
      console.log("Quit.");
      return;
    }
    main(config);
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
