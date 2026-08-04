/**
 * Metrics Stream — WebSocket mini-service.
 *
 * Стримит real-time метрики V/N/S/D_f/G_S/R_T каждые 1.5s всем подключённым клиентам.
 *
 * Port: 3003 (фиксированный).
 * Path: "/" (требование Caddy gateway).
 *
 * Frontend подключается:
 *   io("/?XTransformPort=3003")
 */
import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// local metrics state — independent от Next.js процесса
// (для real stream: можно polled /api/system/metrics из Next.js, но здесь
// мы генерируем метрики локально, чтобы WS-сервис был автономным)
let tick = 0;

interface MetricsSample {
  V: number;
  N: number;
  S: number;
  D_f: number;
  G_S: number;
  R_T: number;
  tick: number;
  timestamp: number;
}

const TARGETS = {
  V: 0.996,
  N: 0.997,
  S: 0.005,
  D_f: 9.008,
  G_S: 145.32,
  R_T: 2.61803,
};

function generateSample(): MetricsSample {
  tick++;
  // small jitter around targets
  const jitter = (amp: number) => (Math.random() - 0.5) * 2 * amp;
  return {
    V: TARGETS.V + jitter(0.002),
    N: TARGETS.N + jitter(0.001),
    S: TARGETS.S + jitter(0.0005),
    D_f: TARGETS.D_f + jitter(0.005),
    G_S: TARGETS.G_S + jitter(0.3),
    R_T: TARGETS.R_T + jitter(0.0005),
    tick,
    timestamp: Date.now(),
  };
}

io.on("connection", (socket) => {
  console.log(`[metrics-stream] client connected: ${socket.id}`);

  // отправить текущий сэмпл при подключении
  socket.emit("metrics:sample", generateSample());

  socket.on("disconnect", () => {
    console.log(`[metrics-stream] client disconnected: ${socket.id}`);
  });

  socket.on("error", (err) => {
    console.error(`[metrics-stream] socket error:`, err);
  });
});

// Стримим всем каждые 1.5s
setInterval(() => {
  const sample = generateSample();
  io.emit("metrics:sample", sample);
}, 1500);

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[metrics-stream] WebSocket server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[metrics-stream] SIGTERM, shutting down...");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[metrics-stream] SIGINT, shutting down...");
  httpServer.close(() => process.exit(0));
});
