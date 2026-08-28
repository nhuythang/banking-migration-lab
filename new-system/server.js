// new-system/server.js
const express = require("express");
const { buildRouter } = require("../shared/makeRoutes");
const repo = require("./repo");

const app = express();
app.use(express.json());
app.use("/api/v1", buildRouter(repo));
app.get("/health", (_q, r) => r.json({ system: "new", db: "GaussDB(migrated)", status: "ok" }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[NEW system] GaussDB (migrated)  -> http://localhost:${PORT}/api/v1`));
