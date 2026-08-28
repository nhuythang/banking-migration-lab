// shared/makeRoutes.js
// Cùng một bộ endpoint cho CẢ hai hệ thống. Khác biệt hành vi nằm hoàn toàn ở repo + DB.
const express = require("express");

function buildRouter(repo) {
  const r = express.Router();

  // list (phục vụ cả recon lẫn duyệt)
  r.get("/users", (req, res) => {
    const { sort, limit, offset } = req.query;
    res.json(repo.listUsers({ sort, limit: +limit || 1000, offset: +offset || 0 }));
  });
  r.get("/accounts", (req, res) => res.json(repo.listAccounts()));
  r.get("/devices", (req, res) => res.json(repo.listDevices()));
  r.get("/notifications", (req, res) => res.json(repo.listNotifications()));

  r.get("/users/by-email", (req, res) => {
    if (!req.query.email) return res.status(400).json({ error: "email query required" });
    const u = repo.findUserByEmail(req.query.email);
    if (!u) return res.status(404).json({ error: "user not found", email: req.query.email });
    res.json(u);
  });

  r.get("/users/:id", (req, res) => {
    const u = repo.getUser(+req.params.id);
    if (!u) return res.status(404).json({ error: "user not found" });
    res.json(u);
  });
  r.get("/users/:id/accounts", (req, res) => res.json(repo.accountsOf(+req.params.id)));
  r.get("/users/:id/devices", (req, res) => res.json(repo.devicesOf(+req.params.id)));
  r.get("/users/:id/notifications", (req, res) => res.json(repo.notificationsOf(+req.params.id)));

  r.get("/accounts/:id", (req, res) => {
    const a = repo.getAccount(+req.params.id);
    if (!a) return res.status(404).json({ error: "account not found" });
    res.json(a);
  });
  r.post("/accounts", (req, res) => {
    const { user_id, currency = "VND", balance = 0 } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id required" });
    try {
      res.status(201).json(repo.createAccount({ user_id, currency, balance }));
    } catch (e) {
      res.status(409).json({ error: "duplicate key value violates unique constraint", detail: String(e.message) });
    }
  });

  return r;
}

module.exports = { buildRouter };
