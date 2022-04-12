const INITIAL_ZOOM = 0.95;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.8;
const SCROLL_SENSITIVITY = 0.0005;

const ws = new WebSocket(
  (window.location.protocol === "http:" ? "ws" : "wss") + `://${window.location.host}/place`
);

const colorInput = document.getElementById("color");
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

let cameraOffset = { x: 0, y: 0 };
let cameraZoom = INITIAL_ZOOM;

let grid = [];
let pixelSize = 0;

let selectedColor = "#000";

let isDragging = false;
let dragStart = { x: 0, y: 0 };
let initialPinchDistance = null;
let lastZoom = cameraZoom;

const updateCanvasSize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

const resetZoom = () => {
  cameraZoom = INITIAL_ZOOM;
  cameraOffset = { x: 0, y: 0 };
  draw();
};

const drawLine = (x1, y1, x2, y2, color) => {
  context.strokeStyle = color;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
};

const drawSquare = (x, y, side, color) => {
  context.fillStyle = color;
  context.fillRect(x, y, side, side);
};

const draw = () => {
  updateCanvasSize();

  context.translate(window.innerWidth / 2, window.innerHeight / 2);
  context.scale(cameraZoom, cameraZoom);
  context.translate(
    -window.innerWidth / 2 + cameraOffset.x,
    -window.innerHeight / 2 + cameraOffset.y
  );
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);

  let size = grid.length;

  pixelSize = Math.round(Math.min(innerWidth / size, innerHeight / size));
  let marginW = (innerWidth - pixelSize * size) / 2;
  let marginH = (innerHeight - pixelSize * size) / 2;

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      if (y != size && x != size) {
        drawSquare(
          Math.round(marginW + x * pixelSize),
          Math.round(marginH + y * pixelSize),
          pixelSize,
          grid[y][x]
        );
      }

      drawLine(
        Math.round(marginW + x * pixelSize),
        marginH,
        Math.round(marginW + x * pixelSize),
        marginH + size * pixelSize,
        "white"
      );
    }

    drawLine(
      marginW,
      marginH + y * pixelSize,
      marginW + size * pixelSize,
      marginH + y * pixelSize,
      "white"
    );
  }

  requestAnimationFrame(draw);
};

const getEventLocation = (e) => {
  if (e.touches && e.touches.length == 1) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.clientX && e.clientY) {
    return { x: e.clientX, y: e.clientY };
  }
};

const onPointerDown = (e) => {
  isDragging = true;
  dragStart.x = getEventLocation(e).x / cameraZoom - cameraOffset.x;
  dragStart.originalX = getEventLocation(e).x;
  dragStart.y = getEventLocation(e).y / cameraZoom - cameraOffset.y;
  dragStart.originalY = getEventLocation(e).y;
};

const onPointerUp = (e) => {
  isDragging = false;
  initialPinchDistance = null;
  lastZoom = cameraZoom;
};

const onPointerMove = (e) => {
  if (isDragging) {
    cameraOffset.x = getEventLocation(e).x / cameraZoom - dragStart.x;
    cameraOffset.y = getEventLocation(e).y / cameraZoom - dragStart.y;
  }
};

const adjustZoom = (zoomAmount, zoomFactor) => {
  if (!isDragging) {
    if (zoomAmount) {
      cameraZoom += zoomAmount;
    } else if (zoomFactor) {
      cameraZoom = zoomFactor * lastZoom;
    }

    cameraZoom = Math.min(cameraZoom, MAX_ZOOM);
    cameraZoom = Math.max(cameraZoom, MIN_ZOOM);
  }
};

const handlePinch = (e) => {
  e.preventDefault();

  let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

  let currentDistance = (touch1.x - touch2.x) ** 2 + (touch1.y - touch2.y) ** 2;

  if (initialPinchDistance == null) {
    initialPinchDistance = currentDistance;
  } else {
    adjustZoom(null, currentDistance / initialPinchDistance);
  }
};

const handleTouch = (e, singleTouchHandler) => {
  if (e.touches.length == 1) {
    singleTouchHandler(e);
  } else if (e.type == "touchmove" && e.touches.length == 2) {
    isDragging = false;
    handlePinch(e);
  }
};

const placePixel = ({ x, y }) => {
  if (x != dragStart.originalX || y != dragStart.originalY) {
    return;
  }

  let zoomedPixelSize = pixelSize * cameraZoom;
  let totalSize = grid.length * zoomedPixelSize;

  let zoomedMarginW = (window.innerWidth - totalSize) / 2;
  let zoomedMarginH = (window.innerHeight - totalSize) / 2;

  x -= zoomedMarginW + cameraOffset.x * cameraZoom;
  y -= zoomedMarginH + cameraOffset.y * cameraZoom;

  let pixelX = Math.floor(x / zoomedPixelSize);
  let pixelY = Math.floor(y / zoomedPixelSize);

  setPixel(pixelX, pixelY, selectedColor);
};

const setPixel = (x, y, color) => {
  if (x < 0 || y < 0 || x >= grid.length || y >= grid.length) {
    return;
  }

  grid[y][x] = color;

  let pixel = { x, y, color };

  ws.send(JSON.stringify(pixel));
};

ws.addEventListener("message", (message) => {
  try {
    let { type, data } = JSON.parse(message.data);

    switch (type) {
      case "GRID":
        console.log(`Received grid!`);
        grid = data;
        draw();
        break;
      case "PIXELS":
        console.log(`Received ${data.length} pixels`);
        data.forEach(({ x, y, color }) => {
          grid[y][x] = color;
        });
        break;
      case "PLAYERS":
        console.log(`Received ${data} players`);
        document.getElementById("players").innerHTML = `${data} player` + (data == 1 ? "" : "s");
        break;
      default:
        console.log(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(message, error.message);
  }
});

canvas.addEventListener("dblclick", resetZoom);
canvas.addEventListener("click", placePixel);

canvas.addEventListener("mousedown", onPointerDown);
canvas.addEventListener("mouseup", onPointerUp);
canvas.addEventListener("mousemove", onPointerMove);

canvas.addEventListener("touchstart", (e) => handleTouch(e, onPointerDown));
canvas.addEventListener("touchend", (e) => handleTouch(e, onPointerUp));
canvas.addEventListener("touchmove", (e) => handleTouch(e, onPointerMove));

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  adjustZoom(event.deltaY * SCROLL_SENSITIVITY);
});

colorInput.addEventListener("change", (event) => (selectedColor = event.target.value));

window.addEventListener("resize", draw);
