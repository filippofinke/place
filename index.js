process.env.PORT = process.env.PORT || 8080;
process.env.SIZE = process.env.SIZE || 60;
process.env.INTERVAL = process.env.INTERVAL || 500;
process.env.DEFAULT_COLOR = process.env.DEFAULT_COLOR || "#aaa";

const express = require("express");
const compression = require("compression");
const expressWs = require("express-ws");
const path = require("path");

const app = express();
const wss = expressWs(app);

let grid = [];
let pixelsToUpdate = [];

const initGrid = () => {
  for (let i = 0; i < process.env.SIZE; i++) {
    let row = [];
    for (let x = 0; x < process.env.SIZE; x++) {
      row.push(process.env.DEFAULT_COLOR);
    }
    grid.push(row);
  }
};

const broadcast = (data) => {
  let json = JSON.stringify(data);

  wss.getWss().clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(json);
    }
  });
};

const broadcastPixels = () => {
  if (pixelsToUpdate.length > 0) {
    clone = pixelsToUpdate.slice();
    pixelsToUpdate = [];

    console.log(`ws: broadcasting ${clone.length} pixels`);
    broadcast({ type: "PIXELS", data: clone });
  }

  setTimeout(broadcastPixels, process.env.INTERVAL);
};

const broadcastPlayers = () => {
  let players = wss.getWss().clients.size;

  broadcast({ type: "PLAYERS", data: players });
};

app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

app.ws("/place", (ws, req) => {
  console.log(`ws: new connection ${req.ip}`);
  broadcastPlayers();

  ws.send(JSON.stringify({ type: "GRID", data: grid }));

  ws.on("message", (message) => {
    try {
      let { x, y, color } = JSON.parse(message);

      if (x < 0 || y < 0 || x >= process.env.SIZE || y >= process.env.SIZE) {
        console.log(`error: invalid coordinates: ${x}, ${y}`);
        return;
      }

      const isValidColor = /^#([0-9-a-f]{6}|[0-9-a-f]{3})$/i.test(color);
      if (!isValidColor) {
        console.log(`error: invalid color: ${color}`);
        return;
      }

      console.log(`ws: received ${x}, ${y}, ${color}`);

      grid[y][x] = color;
      pixelsToUpdate.push({ x, y, color });
    } catch {
      console.log("error: failed to parse message:", message);
    }
  });

  ws.on("close", broadcastPlayers);
});

app.listen(process.env.PORT, () => {
  console.log(`place is running on port ${process.env.PORT}`);
  initGrid();
  broadcastPixels();
});
