// shared/bugs.js — các phép biến đổi cài lỗi migration (dùng khi build new-system)

// BUG-01: mojibake UTF-8 đọc nhầm Latin-1 ("Nguyễn" -> "Nguyá»…n")
function mojibake(s) {
  return Buffer.from(s, "utf8").toString("latin1");
}
function questionMarks(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "?").replace(/[đĐ]/g, "?");
}
function corruptViet(s, id) {
  if (id % 3 === 0) return mojibake(s);
  if (id % 7 === 0) return questionMarks(s);
  return s;
}

// BUG-02: timestamp lệch -7h + mất mili-giây
function shiftTz(sqlserverTs) {
  if (sqlserverTs == null) return null;
  const m = sqlserverTs.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return sqlserverTs;
  const [, Y, Mo, D, h, mi, s] = m.map(Number);
  const shifted = new Date(Date.UTC(Y, Mo - 1, D, h, mi, s) - 7 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())} ` +
         `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}`;
}

// BUG-03: money 4dp -> 2dp
function moneyLoss(text4dp) {
  return Number(Number(text4dp).toFixed(2));
}

// BUG-04: bit NULL -> 0
function bitCoalesce(v) {
  return v == null ? 0 : v;
}

module.exports = { mojibake, questionMarks, corruptViet, shiftTz, moneyLoss, bitCoalesce };
