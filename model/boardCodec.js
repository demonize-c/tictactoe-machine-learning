function encodeCell(cell) {
  return (cell + 1) / 2;
}

function decodeCell(value) {
  if (value >= 0.75) {
    return 1;
  }
  if (value <= 0.25) {
    return -1;
  }
  return 0;
}

function encodeBoard(board) {
  return board.map((cell) => encodeCell(cell));
}

function decodeBoard(encodedBoard) {
  return encodedBoard.map((value) => decodeCell(value));
}

function toArrayOutput(output, size) {
  if (Array.isArray(output)) {
    return output;
  }

  const arr = [];
  for (let i = 0; i < size; i += 1) {
    arr.push(Number(output[i] ?? output[String(i)] ?? 0));
  }
  return arr;
}

module.exports = {
  encodeCell,
  decodeCell,
  encodeBoard,
  decodeBoard,
  toArrayOutput
};
