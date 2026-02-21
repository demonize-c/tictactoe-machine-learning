const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DATASETS_DIR = path.resolve(process.cwd(), "datasets");
const LEGACY_CSV_DIR = path.resolve(DATASETS_DIR, "csv");
const LEGACY_LOG_FILE = path.resolve(DATASETS_DIR, "created_csv_files.txt");

const ACTION_CANCEL = "__CANCEL__";
const ACTION_QUIT = "__QUIT__";

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isInsideDatasets(dirPath) {
  const relative = path.relative(DATASETS_DIR, dirPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function listTrainingDataTargets() {
  ensureDir(DATASETS_DIR);

  const targets = [];

  const entries = fs
    .readdirSync(DATASETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.resolve(DATASETS_DIR, entry.name);

    if (entry.name.startsWith("training_data_")) {
      targets.push({
        id: `training:${entry.name}`,
        label: entry.name,
        dirPath: fullPath,
        removeWhenEmpty: true,
        getFiles() {
          const files = [];
          if (fs.existsSync(fullPath)) {
            const dirFiles = fs
              .readdirSync(fullPath)
              .filter((name) => name.toLowerCase().endsWith(".csv"))
              .map((name) => path.resolve(fullPath, name));
            files.push(...dirFiles);

            const recordsPath = path.resolve(fullPath, "records.txt");
            if (fs.existsSync(recordsPath)) {
              files.push(recordsPath);
            }
          }
          return files.sort();
        }
      });
      continue;
    }
  }

  if (fs.existsSync(LEGACY_CSV_DIR)) {
    targets.push({
      id: "legacy:csv",
      label: "csv (legacy folder)",
      dirPath: LEGACY_CSV_DIR,
      removeWhenEmpty: false,
      getFiles() {
        if (!fs.existsSync(LEGACY_CSV_DIR)) {
          return [];
        }
        return fs
          .readdirSync(LEGACY_CSV_DIR)
          .filter((name) => name.toLowerCase().endsWith(".csv"))
          .map((name) => path.resolve(LEGACY_CSV_DIR, name))
          .sort();
      }
    });
  }

  if (fs.existsSync(LEGACY_LOG_FILE)) {
    targets.push({
      id: "legacy:log",
      label: "datasets root (legacy created_csv_files.txt)",
      dirPath: DATASETS_DIR,
      removeWhenEmpty: false,
      getFiles() {
        return fs.existsSync(LEGACY_LOG_FILE) ? [LEGACY_LOG_FILE] : [];
      }
    });
  }

  return targets;
}

function getTargetFiles(target) {
  return target.getFiles().filter((filePath) => fs.existsSync(filePath));
}

function formatTargetOption(target) {
  const fileCount = getTargetFiles(target).length;
  const relative = path.relative(process.cwd(), target.dirPath);
  return `${target.label}  (${fileCount} file${fileCount === 1 ? "" : "s"})  [${relative}]`;
}

function formatFileOption(target, filePath) {
  return path.relative(target.dirPath, filePath);
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
  { allowCancel = false, allowQuit = true, hint } = {}
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

function promptSingleSelect({ title, options, allowCancel = false, allowQuit = true, hint }) {
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

function renderMultiSelect(
  title,
  options,
  selectedIndex,
  checkedSet,
  { allowCancel = false, allowQuit = true, hint } = {}
) {
  clearScreen();
  console.log(title);
  console.log("");

  options.forEach((option, idx) => {
    const cursor = idx === selectedIndex ? ">" : " ";
    const checked = checkedSet.has(idx) ? "x" : " ";
    console.log(`${cursor} [${checked}] ${option}`);
  });

  console.log("");
  if (hint) {
    console.log(hint);
    return;
  }

  let tail = "UP/DOWN: navigate, SPACE: select, A: toggle all, ENTER: confirm";
  if (allowCancel) {
    tail += ", C: cancel";
  }
  if (allowQuit) {
    tail += ", Q: quit";
  }
  console.log(tail);
}

function promptMultiSelect({ title, options, allowCancel = false, allowQuit = true, hint }) {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    const checkedSet = new Set();

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
        renderMultiSelect(title, options, selectedIndex, checkedSet, {
          allowCancel,
          allowQuit,
          hint
        });
        return;
      }

      if (key && key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
        renderMultiSelect(title, options, selectedIndex, checkedSet, {
          allowCancel,
          allowQuit,
          hint
        });
        return;
      }

      if (key && key.name === "space") {
        if (checkedSet.has(selectedIndex)) {
          checkedSet.delete(selectedIndex);
        } else {
          checkedSet.add(selectedIndex);
        }
        renderMultiSelect(title, options, selectedIndex, checkedSet, {
          allowCancel,
          allowQuit,
          hint
        });
        return;
      }

      if (key && key.name === "a") {
        if (checkedSet.size === options.length) {
          checkedSet.clear();
        } else {
          checkedSet.clear();
          for (let i = 0; i < options.length; i += 1) {
            checkedSet.add(i);
          }
        }
        renderMultiSelect(title, options, selectedIndex, checkedSet, {
          allowCancel,
          allowQuit,
          hint
        });
        return;
      }

      if (key && key.name === "return") {
        done(Array.from(checkedSet).sort((a, b) => a - b));
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
    renderMultiSelect(title, options, selectedIndex, checkedSet, {
      allowCancel,
      allowQuit,
      hint
    });
  });
}

function deleteFiles(filePaths) {
  const deleted = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    fs.unlinkSync(filePath);
    deleted.push(filePath);
  }

  return { deleted };
}

function removeTargetDirIfEmpty(target) {
  if (!target.removeWhenEmpty) {
    return false;
  }

  if (!fs.existsSync(target.dirPath)) {
    return false;
  }

  const remaining = fs.readdirSync(target.dirPath);
  if (remaining.length > 0) {
    return false;
  }

  if (!isInsideDatasets(target.dirPath)) {
    return false;
  }

  fs.rmdirSync(target.dirPath);
  return true;
}

function printSummary({ deletedFiles, removedDirs }) {
  console.log("Cleanup completed.");
  console.log(`Deleted files: ${deletedFiles.length}`);
  console.log(`Removed empty folders: ${removedDirs.length}`);

  if (deletedFiles.length > 0) {
    console.log("\nDeleted:");
    for (const filePath of deletedFiles) {
      console.log(`- ${path.relative(process.cwd(), filePath)}`);
    }
  }

  if (removedDirs.length > 0) {
    console.log("\nRemoved folders:");
    for (const dirPath of removedDirs) {
      console.log(`- ${path.relative(process.cwd(), dirPath)}`);
    }
  }
}

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("clear:records requires an interactive terminal (TTY).");
  }
}

function deleteAllFromTargets(targets, deletedFiles, removedDirs) {
  for (const target of targets) {
    const files = getTargetFiles(target);
    const { deleted } = deleteFiles(files);
    deletedFiles.push(...deleted);

    if (removeTargetDirIfEmpty(target)) {
      removedDirs.push(target.dirPath);
    }
  }
}

async function selectFolders(targets) {
  while (true) {
    const folderOptions = targets.map((target) => formatTargetOption(target));
    const selectedFolderIndexes = await promptMultiSelect({
      title: "Clear Records - Select Folder(s)",
      options: folderOptions,
      allowCancel: true,
      allowQuit: true
    });

    if (selectedFolderIndexes === ACTION_CANCEL || selectedFolderIndexes === ACTION_QUIT) {
      return selectedFolderIndexes;
    }

    if (selectedFolderIndexes.length === 0) {
      console.log("No folder selected. Choose at least one folder or cancel.");
      continue;
    }

    return selectedFolderIndexes.map((idx) => targets[idx]);
  }
}

async function chooseDeleteMode() {
  return promptSingleSelect({
    title: "Clear Records - Step 2\nFor selected folder(s):",
    options: ["Delete ALL files", "Select files"],
    allowCancel: true,
    allowQuit: true
  });
}

async function selectFilesFromTargets(targets) {
  const chosenFiles = [];

  for (const target of targets) {
    const files = getTargetFiles(target);
    if (files.length === 0) {
      continue;
    }

    const options = files.map((filePath) => formatFileOption(target, filePath));
    const selected = await promptMultiSelect({
      title: `Select files to delete from ${target.label}`,
      options,
      allowCancel: true,
      allowQuit: true
    });

    if (selected === ACTION_CANCEL || selected === ACTION_QUIT) {
      return selected;
    }

    for (const idx of selected) {
      chosenFiles.push(files[idx]);
    }
  }

  return chosenFiles;
}

async function runInteractiveClear() {
  ensureInteractiveTerminal();

  const targets = listTrainingDataTargets();
  if (targets.length === 0) {
    console.log("No training data folders or legacy files found in datasets.");
    return;
  }

  const deletedFiles = [];
  const removedDirs = [];

  while (true) {
    const firstChoice = await promptSingleSelect({
      title: "Clear Records - Step 1\nChoose cleanup scope:",
      options: ["Clear ALL folders/files", "Select folder(s)"],
      allowCancel: false,
      allowQuit: true,
      hint: "UP/DOWN: navigate, ENTER: confirm, Q: quit"
    });

    if (firstChoice === ACTION_QUIT) {
      console.log("Quit.");
      return;
    }

    if (firstChoice === 0) {
      deleteAllFromTargets(targets, deletedFiles, removedDirs);
      printSummary({ deletedFiles, removedDirs });
      return;
    }

    const selectedTargets = await selectFolders(targets);
    if (selectedTargets === ACTION_QUIT) {
      console.log("Quit.");
      return;
    }
    if (selectedTargets === ACTION_CANCEL) {
      continue;
    }

    while (true) {
      const secondChoice = await chooseDeleteMode();

      if (secondChoice === ACTION_QUIT) {
        console.log("Quit.");
        return;
      }

      if (secondChoice === ACTION_CANCEL) {
        break;
      }

      if (secondChoice === 0) {
        deleteAllFromTargets(selectedTargets, deletedFiles, removedDirs);
        printSummary({ deletedFiles, removedDirs });
        return;
      }

      const chosenFiles = await selectFilesFromTargets(selectedTargets);

      if (chosenFiles === ACTION_QUIT) {
        console.log("Quit.");
        return;
      }

      if (chosenFiles === ACTION_CANCEL) {
        continue;
      }

      const { deleted } = deleteFiles(chosenFiles);
      deletedFiles.push(...deleted);

      for (const target of selectedTargets) {
        if (removeTargetDirIfEmpty(target)) {
          removedDirs.push(target.dirPath);
        }
      }

      printSummary({ deletedFiles, removedDirs });
      return;
    }
  }
}

runInteractiveClear().catch((error) => {
  try {
    process.stdin.setRawMode(false);
  } catch (_error) {
    // ignore cleanup failure
  }
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
