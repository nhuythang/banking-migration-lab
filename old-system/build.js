// old-system/build.js — dựng data.db của HỆ THỐNG CŨ (SQL Server, dữ liệu đúng)
const path = require("path");
const Database = require("better-sqlite3");
const { generateAll } = require("../shared/generate");

const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");
db.exec(`
DROP TABLE IF EXISTS Notifications; DROP TABLE IF EXISTS Devices;
DROP TABLE IF EXISTS Accounts; DROP TABLE IF EXISTS Users;
CREATE TABLE Users (UserId INTEGER PRIMARY KEY, FullName TEXT NOT NULL, Email TEXT NOT NULL,
  Phone TEXT, IsActive INTEGER, CreatedAt TEXT NOT NULL, LastLogin TEXT);
CREATE TABLE Accounts (AccountId INTEGER PRIMARY KEY, UserId INTEGER NOT NULL, AccountNo TEXT NOT NULL,
  Currency TEXT NOT NULL, Balance TEXT NOT NULL, IsPrimary INTEGER, CreatedAt TEXT NOT NULL);
CREATE TABLE Devices (DeviceId INTEGER PRIMARY KEY, UserId INTEGER NOT NULL, DeviceName TEXT NOT NULL,
  Model TEXT, OsVersion TEXT, IsTrusted INTEGER, LastSeen TEXT);
CREATE TABLE Notifications (NotificationId INTEGER PRIMARY KEY, UserId INTEGER NOT NULL, Title TEXT NOT NULL,
  Content TEXT NOT NULL, IsRead INTEGER, CreatedAt TEXT NOT NULL);
`);

const { users, accounts, devices, notifications } = generateAll();
const insU = db.prepare(`INSERT INTO Users VALUES (@id,@full_name,@email,@phone,@is_active,@created_at,@last_login)`);
const insA = db.prepare(`INSERT INTO Accounts VALUES (@id,@user_id,@account_no,@currency,@balance,@is_primary,@created_at)`);
const insD = db.prepare(`INSERT INTO Devices VALUES (@id,@user_id,@device_name,@model,@os_version,@is_trusted,@last_seen)`);
const insN = db.prepare(`INSERT INTO Notifications VALUES (@id,@user_id,@title,@content,@is_read,@created_at)`);
db.transaction(() => {
  for (const u of users) insU.run(u);
  for (const a of accounts) insA.run({ ...a, balance: Number(a.balance).toFixed(4) });
  for (const d of devices) insD.run(d);
  for (const n of notifications) insN.run(n);
})();
db.prepare(`UPDATE Accounts SET Balance=printf('%.4f',CAST(Balance AS REAL)) WHERE Balance NOT LIKE '%.____'`).run();

const c = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log("[old-system] data.db built (truth):", { users: c("Users"), accounts: c("Accounts"), devices: c("Devices"), notifications: c("Notifications") });
db.close();
