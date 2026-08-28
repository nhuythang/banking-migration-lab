// old-system/server.js
const express = require("express");
const { buildRouter } = require("../shared/makeRoutes");
const repo = require("./repo");

const app = express();
app.use(express.json());
app.use("/api/v1", buildRouter(repo));
app.get("/health", (_q, r) => r.json({ system: "old", db: "SQLServer(truth)", status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[OLD system] SQL Server (truth)  -> http://localhost:${PORT}/api/v1`));
