// new-system/repo.js — hành xử như GaussDB (kèm quirk runtime)
const path = require("path");
const Database = require("better-sqlite3");
const db = new Database(path.join(__dirname, "data.db"));

// BUG-04(b): bit 0/1 -> boolean true/false trong JSON
const BIT = new Set(["isactive", "isprimary", "istrusted", "isread"]);
const castBits = (row) => {
  if (!row) return row;
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k] = BIT.has(k) ? Boolean(v) : v;
  return o;
};

// BUG-06: sequence sau di trú khởi tạo lệch xuống thấp
let seq = 50; // max thực tế 64 -> đụng khoá

module.exports = {
  listUsers({ sort, limit = 1000, offset = 0 } = {}) {
    const rows = sort === "name"
      ? db.prepare("SELECT * FROM users ORDER BY fullname").all()   // BUG-05c: byte-order, không theo tiếng Việt
      : db.prepare("SELECT * FROM users ORDER BY userid").all();
    return rows.slice(offset, offset + limit).map(castBits);
  },
  listAccounts: () => db.prepare("SELECT * FROM accounts ORDER BY accountid").all().map(castBits),
  listDevices: () => db.prepare("SELECT * FROM devices ORDER BY deviceid").all().map(castBits),
  listNotifications: () => db.prepare("SELECT * FROM notifications ORDER BY notificationid").all().map(castBits),
  getUser: (id) => castBits(db.prepare("SELECT * FROM users WHERE userid=?").get(id) || null),
  findUserByEmail: (email) => castBits(db.prepare("SELECT * FROM users WHERE email=?").get(email) || null), // BUG-05b: case-sensitive
  accountsOf: (uid) => db.prepare("SELECT * FROM accounts WHERE userid=? ORDER BY accountid").all(uid).map(castBits),
  devicesOf: (uid) => db.prepare("SELECT * FROM devices WHERE userid=? ORDER BY deviceid").all(uid).map(castBits),
  notificationsOf: (uid) => db.prepare("SELECT * FROM notifications WHERE userid=? ORDER BY createdat DESC").all(uid).map(castBits),
  getAccount: (id) => castBits(db.prepare("SELECT * FROM accounts WHERE accountid=?").get(id) || null),
  createAccount({ user_id, currency, balance }) {
    const id = seq++;
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run( // đụng khoá -> duplicate key
      id, user_id, String(190000000000 + id * 7), currency, Number(Number(balance).toFixed(2)), 0,
      new Date().toISOString().slice(0, 19).replace("T", " "));
    return castBits(db.prepare("SELECT * FROM accounts WHERE accountid=?").get(id));
  },
};
