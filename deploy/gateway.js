// deploy/gateway.js
// Một process public: mount CẢ hai hệ thống dưới path prefix, để deploy sau MỘT URL duy nhất.
//   OLD (SQL Server, truth)  -> /old/api/v1/...   + /old/health
//   NEW (GaussDB, migrated)  -> /new/api/v1/...   + /new/health
// Vẫn hai DB / hai repo độc lập; chỉ khác là chung một host.
const express = require("express");
const { buildRouter } = require("../shared/makeRoutes");
const oldRepo = require("../old-system/repo");
const newRepo = require("../new-system/repo");

const app = express();
app.use(express.json());

app.use("/old/api/v1", buildRouter(oldRepo));
app.use("/new/api/v1", buildRouter(newRepo));
app.get("/old/health", (_q, r) => r.json({ system: "old", db: "SQLServer(truth)", status: "ok" }));
app.get("/new/health", (_q, r) => r.json({ system: "new", db: "GaussDB(migrated)", status: "ok" }));

// Trang chủ: hướng dẫn nhanh cho người truy cập từ internet
app.get("/", (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;
  res.type("html").send(`<!doctype html><meta charset="utf-8">
<title>Banking Migration Lab</title>
<style>body{font:15px/1.6 system-ui,Segoe UI,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1b1f24}
code{background:#f2f3f5;padding:1px 5px;border-radius:4px}h1{font-size:20px}h2{font-size:15px;margin-top:24px}
a{color:#2b6cb0}.tag{display:inline-block;font-size:12px;padding:1px 7px;border-radius:10px;color:#fff}
.old{background:#3178c6}.new{background:#b0389b}.muted{color:#667}</style>
<h1>Banking Migration Lab <span class="muted">— luyện API migration testing (SQL Server → GaussDB)</span></h1>
<p>Dữ liệu ngân hàng <b>giả</b> phục vụ luyện tập. Hai hệ thống cùng một API contract:</p>
<p><span class="tag old">OLD</span> nguồn đúng (baseline): <code>/old/api/v1</code> ·
   <span class="tag new">NEW</span> đã di trú, cài lỗi: <code>/new/api/v1</code></p>
<h2>Thử nhanh (so sánh 2 bên)</h2>
<ul>
<li><a href="/old/api/v1/users/3">/old/api/v1/users/3</a> vs <a href="/new/api/v1/users/3">/new/api/v1/users/3</a> — unicode & key-case & datetime</li>
<li><a href="/old/api/v1/users/1/accounts">/old/.../users/1/accounts</a> vs <a href="/new/api/v1/users/1/accounts">/new/...</a> — money precision</li>
<li><a href="/old/api/v1/users?sort=name&limit=6">/old/...?sort=name</a> vs <a href="/new/api/v1/users?sort=name&limit=6">/new/...?sort=name</a> — collation</li>
<li><a href="/old/api/v1/users/by-email?email=user2.vip@bankdemo.vn">/old/...by-email (thường)</a> vs
    <a href="/new/api/v1/users/by-email?email=user2.vip@bankdemo.vn">/new/...</a> — case-sensitivity</li>
</ul>
<h2>Reconcile từ máy bạn</h2>
<pre><code>OLD_BASE=${host}/old NEW_BASE=${host}/new node harness/reconcile.mjs</code></pre>
<p class="muted">Endpoint: /users, /users/:id, /users/by-email, /users/:id/{accounts|devices|notifications},
/accounts, /accounts/:id, POST /accounts, /devices, /notifications, /health</p>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[gateway] OLD:/old  NEW:/new  -> http://localhost:${PORT}`));
