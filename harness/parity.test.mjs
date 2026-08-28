// harness/parity.test.mjs
// Test parity chức năng giữa OLD và NEW (những lỗi HÀNH VI mà reconcile dữ liệu không thấy).
// Chạy: npm run start (cả 2 server) rồi ở terminal khác: npm test
// Env : OLD_BASE (:3001), NEW_BASE (:3002)

import { test } from "node:test";
import assert from "node:assert/strict";

const OLD = process.env.OLD_BASE || "http://localhost:3001";
const NEW = process.env.NEW_BASE || "http://localhost:3002";
const jget = (base, p) => fetch(`${base}/api/v1${p}`);
const json = (base, p) => jget(base, p).then((r) => r.json());

// BUG-05b — tra email không phân biệt hoa/thường phải cho cùng kết quả ở 2 hệ thống
test("BUG-05b parity: tra email chữ thường", async () => {
  const email = "user2.vip@bankdemo.vn"; // dữ liệu lưu 'user2.VIP@...'
  const oldRes = await jget(OLD, `/users/by-email?email=${email}`);
  const newRes = await jget(NEW, `/users/by-email?email=${email}`);
  assert.equal(newRes.status, oldRes.status); // FAIL: old 200 vs new 404
});

// BUG-05c — thứ tự sort theo tên phải trùng nhau
test("BUG-05c parity: thứ tự sort=name", async () => {
  const o = (await json(OLD, "/users?sort=name&limit=1000")).map((u) => u.UserId ?? u.userid);
  const n = (await json(NEW, "/users?sort=name&limit=1000")).map((u) => u.UserId ?? u.userid);
  assert.deepEqual(n, o); // FAIL: collation khác -> thứ tự khác
});

// BUG-06 — tạo account mới phải thành công ở cả 2 hệ thống
test("BUG-06 parity: POST /accounts", async () => {
  const body = JSON.stringify({ user_id: 1, currency: "VND", balance: 1000 });
  const headers = { "Content-Type": "application/json" };
  const oldRes = await fetch(`${OLD}/api/v1/accounts`, { method: "POST", headers, body });
  const newRes = await fetch(`${NEW}/api/v1/accounts`, { method: "POST", headers, body });
  assert.equal(newRes.status, oldRes.status); // FAIL: old 201 vs new 409 (sequence lệch)
});

// Data-level tiêu biểu (phần lớn để reconcile.mjs lo, đây chỉ minh hoạ)
test("BUG-03 parity: balance của account 1 giữ đủ 4dp", async () => {
  const o = await json(OLD, "/accounts/1");
  const n = await json(NEW, "/accounts/1");
  assert.equal(Number(n.balance).toFixed(4), Number(o.Balance).toFixed(4)); // FAIL: mất precision
});

test("BUG-01 parity: fullname user 3 không mojibake", async () => {
  const o = await json(OLD, "/users/3");
  const n = await json(NEW, "/users/3");
  assert.equal(n.fullname, o.FullName); // FAIL: mojibake
});
