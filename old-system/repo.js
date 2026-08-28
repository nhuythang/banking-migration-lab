// old-system/repo.js — hành xử như SQL Server (đúng)
const path = require("path");
const Database = require("better-sqlite3");
const db = new Database(path.join(__dirname, "data.db"));

module.exports = {
  listUsers({ sort, limit = 1000, offset = 0 } = {}) {
    let rows = db.prepare("SELECT * FROM Users").all();
    if (sort === "name") rows.sort((a, b) => a.FullName.localeCompare(b.FullName, "vi")); // Vietnamese_CI_AS
    else rows.sort((a, b) => a.UserId - b.UserId);
    return rows.slice(offset, offset + limit);
  },
  listAccounts: () => db.prepare("SELECT * FROM Accounts ORDER BY AccountId").all(),
  listDevices: () => db.prepare("SELECT * FROM Devices ORDER BY DeviceId").all(),
  listNotifications: () => db.prepare("SELECT * FROM Notifications ORDER BY NotificationId").all(),
  getUser: (id) => db.prepare("SELECT * FROM Users WHERE UserId=?").get(id) || null,
  findUserByEmail: (email) => db.prepare("SELECT * FROM Users WHERE Email=? COLLATE NOCASE").get(email) || null, // case-insensitive
  accountsOf: (uid) => db.prepare("SELECT * FROM Accounts WHERE UserId=? ORDER BY AccountId").all(uid),
  devicesOf: (uid) => db.prepare("SELECT * FROM Devices WHERE UserId=? ORDER BY DeviceId").all(uid),
  notificationsOf: (uid) => db.prepare("SELECT * FROM Notifications WHERE UserId=? ORDER BY CreatedAt DESC").all(uid),
  getAccount: (id) => db.prepare("SELECT * FROM Accounts WHERE AccountId=?").get(id) || null,
  createAccount({ user_id, currency, balance }) {
    const id = db.prepare("SELECT COALESCE(MAX(AccountId),0)+1 n FROM Accounts").get().n; // IDENTITY đúng
    db.prepare("INSERT INTO Accounts VALUES (?,?,?,?,?,?,?)").run(
      id, user_id, String(190000000000 + id * 7), currency, Number(balance).toFixed(4), 0,
      new Date().toISOString().slice(0, 23).replace("T", " "));
    return db.prepare("SELECT * FROM Accounts WHERE AccountId=?").get(id);
  },
};
