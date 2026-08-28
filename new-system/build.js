// new-system/build.js
// Dựng data.db của HỆ THỐNG MỚI (GaussDB) bằng cách "migrate" từ old-system/data.db,
// cài sẵn lỗi data-level. Đọc từ DB cũ = mô phỏng migration đọc từ prod cũ.
const path = require("path");
const Database = require("better-sqlite3");
const { corruptViet, shiftTz, moneyLoss, bitCoalesce } = require("../shared/bugs");

const OLD = path.join(__dirname, "..", "old-system", "data.db");
const src = new Database(OLD, { readonly: true });
const tgt = new Database(path.join(__dirname, "data.db"));
tgt.pragma("journal_mode = WAL");

// BUG-05a: identifier fold về chữ thường
tgt.exec(`
DROP TABLE IF EXISTS notifications; DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS users;
CREATE TABLE users (userid INTEGER PRIMARY KEY, fullname TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  isactive INTEGER NOT NULL DEFAULT 0, createdat TEXT NOT NULL, lastlogin TEXT);
CREATE TABLE accounts (accountid INTEGER PRIMARY KEY, userid INTEGER NOT NULL, accountno TEXT NOT NULL,
  currency TEXT NOT NULL, balance REAL NOT NULL, isprimary INTEGER NOT NULL DEFAULT 0, createdat TEXT NOT NULL);
CREATE TABLE devices (deviceid INTEGER PRIMARY KEY, userid INTEGER NOT NULL, devicename TEXT NOT NULL,
  model TEXT, osversion TEXT, istrusted INTEGER NOT NULL DEFAULT 0, lastseen TEXT);
CREATE TABLE notifications (notificationid INTEGER PRIMARY KEY, userid INTEGER NOT NULL, title TEXT NOT NULL,
  content TEXT NOT NULL, isread INTEGER NOT NULL DEFAULT 0, createdat TEXT NOT NULL);
`);

const iU = tgt.prepare(`INSERT INTO users VALUES (@userid,@fullname,@email,@phone,@isactive,@createdat,@lastlogin)`);
const iA = tgt.prepare(`INSERT INTO accounts VALUES (@accountid,@userid,@accountno,@currency,@balance,@isprimary,@createdat)`);
const iD = tgt.prepare(`INSERT INTO devices VALUES (@deviceid,@userid,@devicename,@model,@osversion,@istrusted,@lastseen)`);
const iN = tgt.prepare(`INSERT INTO notifications VALUES (@notificationid,@userid,@title,@content,@isread,@createdat)`);

tgt.transaction(() => {
  for (const u of src.prepare("SELECT * FROM Users").all())
    iU.run({ userid: u.UserId, fullname: corruptViet(u.FullName, u.UserId), email: u.Email, phone: u.Phone,
      isactive: bitCoalesce(u.IsActive), createdat: shiftTz(u.CreatedAt), lastlogin: shiftTz(u.LastLogin) });
  for (const a of src.prepare("SELECT * FROM Accounts").all())
    iA.run({ accountid: a.AccountId, userid: a.UserId, accountno: a.AccountNo, currency: a.Currency,
      balance: moneyLoss(a.Balance), isprimary: bitCoalesce(a.IsPrimary), createdat: shiftTz(a.CreatedAt) });
  for (const d of src.prepare("SELECT * FROM Devices").all())
    iD.run({ deviceid: d.DeviceId, userid: d.UserId, devicename: corruptViet(d.DeviceName, d.DeviceId),
      model: d.Model, osversion: d.OsVersion, istrusted: bitCoalesce(d.IsTrusted), lastseen: shiftTz(d.LastSeen) });
  for (const n of src.prepare("SELECT * FROM Notifications").all())
    iN.run({ notificationid: n.NotificationId, userid: n.UserId, title: n.Title,
      content: corruptViet(n.Content, n.NotificationId), isread: bitCoalesce(n.IsRead), createdat: shiftTz(n.CreatedAt) });
})();

src.close();
const c = (t) => tgt.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log("[new-system] data.db built (GaussDB, WITH BUGS):", { users: c("users"), accounts: c("accounts"), devices: c("devices"), notifications: c("notifications") });
tgt.close();
