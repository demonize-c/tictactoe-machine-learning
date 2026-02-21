const fs = require("fs");
const { NeuralNetwork } = require("brain.js");
const { encodeBoard, toArrayOutput } = require("./boardCodec");

function loadModel(modelPath) {
  const payload = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const modelJson = payload.model ? payload.model : payload;

  const net = new NeuralNetwork();
  net.fromJSON(modelJson);

  return {
    net,
    metadata: payload.metadata || null
  };
}

function chooseMoveForPlayer(board, net, playerMarker) {
  if (playerMarker !== 1 && playerMarker !== -1) {
    throw new Error("playerMarker must be 1 or -1.");
  }

  const available = [];
  for (let i = 0; i < 9; i += 1) {
    if (board[i] === 0) {
      available.push(i);
    }
  }

  if (available.length === 0) {
    return null;
  }

  // The model is trained on transitions where mover is Player1 (value 1).
  // Mirror board when selecting move for Player2 so model still applies.
  const perspectiveBoard =
    playerMarker === 1 ? [...board] : board.map((cell) => cell * -1);
  const predicted = toArrayOutput(net.run(encodeBoard(perspectiveBoard)), 9);

  let bestMove = available[0];
  let bestScore = -Infinity;

  for (const move of available) {
    const score = Number(predicted[move] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function choosePlayer1Move(board, net) {
  return chooseMoveForPlayer(board, net, 1);
}

function choosePlayer2Move(board, net) {
  return chooseMoveForPlayer(board, net, -1);
}

module.exports = {
  loadModel,
  choosePlayer1Move,
  choosePlayer2Move
};
