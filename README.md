# TicTacToe ML

Interactive toolkit to generate Tic-Tac-Toe datasets, train a `brain.js` model, inspect CSV games, clear dataset records, and play against a trained model.

## Requirements

- Node.js 18+
- npm

Install dependencies:

```bash
npm install
```

## Scripts

```bash
npm run generate:csv
npm run view:csv
npm run clear:records
npm run train:model
npm run play:game
```

All commands are interactive (wizard-style / arrow-key menus) and require a TTY terminal.

## Typical Flow

1. Generate CSV games into a dataset folder.
2. Train a model from that dataset's `records.txt`.
3. Play against the trained model.

## Dataset Generation (`npm run generate:csv`)

Wizard options include:

- Number of games
- `winnerMoves` (3 to 5)
- Player1 mode:
  - `smart`: Player1 uses minimax (except optional first-move randomness)
  - `dumb`: Player1 can mix random moves based on `player1OtherRandomness`
- `player1FirstRandomness` (0 to 1)
- `player2Randomness` (0 to 1)
- Dataset target:
  - new `training_data_*` folder
  - existing folder

Current generation behavior:

- Start player is mixed ~50/50 between Player1-first and Player2-first.
- In `smart` mode, recorded games keep Player1 as non-losing side (Player1 wins + draws; no Player2 wins).
- In `smart` mode, minimax tie-breaking is deterministic; only configured randomness throttles can introduce randomness.
- Incomplete games are not recorded.

### CSV Row Format

Each data row has 18 numeric columns:

- first 9: board **before Player1 move** (effectively board after Player2 move)
- last 9: board **after Player1 move**

Markers:

- `1` = Player1
- `-1` = Player2
- `0` = empty

Game separators are written as:

```text
GAME_<n>_END
```

## CSV Viewer (`npm run view:csv`)

- Select dataset folder, then CSV file.
- Browse final game states and replay frame-by-frame.
- Works with current dataset folders (`training_data_*`) and legacy `datasets/csv`.

## Train Model (`npm run train:model`)

Wizard steps:

- Select `records.txt` source
- Enter model name
- Set training hyperparameters

Model output is always saved to:

```text
model/models/<model-name>.json
```

Training data loader reads all CSV files listed in selected `records.txt`.

## Play Game (`npm run play:game`)

- Choose trained model via arrow menu
- Choose who starts first
- First mover is always `O`
- In-game input: `1-9`, `q` to quit

You can also pass a model path:

```bash
npm run play:game -- --model model/models/your_model.json
```

## Clear Records (`npm run clear:records`)

Interactive cleanup tool for dataset folders/files:

- clear all
- or select folders/files

Supports cancel/back and quit navigation.

## Project Structure

```text
src/datamaker/     CSV generation and simulation logic
src/tools/         viewer and cleanup tools
game/              playable CLI game
model/             training + runtime inference

datasets/training_data_*/
  *.csv
  records.txt
```

## Notes

- Older models do not auto-update when logic changes. Retrain to use current behavior.
- If strict filters are enabled (for example smart-mode constraints), recorded games can be fewer than requested.
