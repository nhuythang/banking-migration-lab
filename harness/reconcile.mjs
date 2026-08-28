// harness/reconcile.mjs
// Baseline comparison: so khớp OLD vs NEW theo từng field, phân loại sai lệch.
// Chạy:  node harness/reconcile.mjs   (cần cả 2 server đang chạy)
// Env :  OLD_BASE (mặc định :3001)  NEW_BASE (mặc định :3002)  SAMPLES=3
// Exit :  0 nếu khớp hoàn toàn, 1 nếu có sai lệch (dùng trong CI).

import { writeFileSync } from "node:fs";

const OLD = process.env.OLD_BASE || "http://localhost:3001";
const NEW = process.env.NEW_BASE || "http://localhost:3002";
const SAMPLES = +process.env.SAMPLES || 3;

const TABLES = [
  { name: "users",         path: "/users?limit=10000", pk: "userid" },
  { name: "accounts",      path: "/accounts",          pk: "accountid" },
  { name: "devices",       path: "/devices",           pk: "deviceid" },
  { name: "notifications", path: "/notifications",     pk: "notificationid" },
];

const get = (base, p) => fetch(`${base}/api/v1${p}`).then((r) => r.json());
const lowerKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const isTs = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s);
const numish = (v) => v !== null && v !== "" && !isNaN(Number(v));
const hasMojibake = (s) => typeof s === "string" && /[ÃÂ�]|Â»|â€|Ã¡|\uFFFD|\?/.test(s);

// So sánh 1 field -> { equal, category }
function compare(ov, nv) {
  const oNull = ov === null || ov === undefined;
  const nNull = nv === null || nv === undefined;
  if (oNull && nNull) return { equal: true };
  if (oNull !== nNull) return { equal: false, category: "null_lost" };      // BUG-04a
  if (isTs(ov) && isTs(nv)) return { equal: ov === nv, category: "datetime" }; // BUG-02
  if (numish(ov) && numish(nv)) {
    const eq = Number(ov).toFixed(4) === Number(nv).toFixed(4);
    return { equal: eq, category: "number/money" };                         // BUG-03
  }
  if (typeof ov === "boolean" || typeof nv === "boolean") {
    const eq = Boolean(ov) === Boolean(nv);
    // giá trị logic bằng nhau nhưng KIỂU khác nhau (0/1 vs true/false) -> contract drift
    return { equal: eq && typeof ov === typeof nv, category: eq ? "type_drift" : "bool_value" }; // BUG-04b
  }
  if (String(ov) !== String(nv)) {
    const cat = hasMojibake(nv) && !hasMojibake(ov) ? "unicode" : "text";   // BUG-01
    return { equal: false, category: cat };
  }
  return { equal: true };
}

function reconcileTable(t, oldRows, newRows) {
  const O = new Map(oldRows.map((r) => [lowerKeys(r)[t.pk], lowerKeys(r)]));
  const N = new Map(newRows.map((r) => [lowerKeys(r)[t.pk], lowerKeys(r)]));

  const missingInNew = [...O.keys()].filter((k) => !N.has(k));
  const extraInNew = [...N.keys()].filter((k) => !O.has(k));

  // schema key-case drift (BUG-05a)
  const oKeysRaw = oldRows[0] ? Object.keys(oldRows[0]) : [];
  const nKeysRaw = newRows[0] ? Object.keys(newRows[0]) : [];
  const keyCaseDrift = oKeysRaw.filter((k) => !nKeysRaw.includes(k) && nKeysRaw.includes(k.toLowerCase()));

  const fields = {}; // field -> { count, category, samples: [] }
  for (const [pk, orow] of O) {
    const nrow = N.get(pk);
    if (!nrow) continue;
    for (const f of Object.keys(orow)) {
      const res = compare(orow[f], nrow[f]);
      if (res.equal) continue;
      const rec = (fields[f] ||= { count: 0, category: res.category, samples: [] });
      rec.count++;
      if (rec.samples.length < SAMPLES) rec.samples.push({ pk, old: orow[f], new: nrow[f] });
    }
  }
  return { table: t.name, oldCount: O.size, newCount: N.size, missingInNew, extraInNew, keyCaseDrift, fields };
}

function printReport(results) {
  console.log("\n========== RECONCILIATION REPORT ==========");
  console.log(`OLD: ${OLD}    NEW: ${NEW}\n`);
  let totalMismatch = 0;
  for (const r of results) {
    console.log(`### ${r.table.toUpperCase()}  (old=${r.oldCount}, new=${r.newCount})`);
    if (r.missingInNew.length) console.log(`  ! thiếu ở NEW: [${r.missingInNew.slice(0, 10).join(",")}]${r.missingInNew.length > 10 ? "…" : ""}`);
    if (r.extraInNew.length) console.log(`  ! thừa ở NEW: [${r.extraInNew.slice(0, 10).join(",")}]`);
    if (r.keyCaseDrift.length) console.log(`  ⚠ key-case drift (BUG-05a): ${r.keyCaseDrift.join(", ")} → chữ thường`);
    const fnames = Object.keys(r.fields);
    if (!fnames.length && !r.keyCaseDrift.length) { console.log("  ✓ khớp\n"); continue; }
    for (const f of fnames) {
      const x = r.fields[f];
      totalMismatch += x.count;
      const s = x.samples[0];
      const show = (v) => (v === null ? "null" : typeof v === "string" ? `'${v}'` : v);
      console.log(`  ✗ ${f.padEnd(14)} ${String(x.count).padStart(4)}/${r.oldCount}  [${x.category}]  e.g. pk=${s.pk}: ${show(s.old)} → ${show(s.new)}`);
    }
    console.log("");
  }
  console.log(`TỔNG số field sai lệch: ${totalMismatch}`);
  console.log("===========================================\n");
  return totalMismatch;
}

async function main() {
  try {
    await get(OLD, "/users?limit=1"); await get(NEW, "/users?limit=1");
  } catch {
    console.error("Không kết nối được 2 hệ thống. Chạy: npm run start:old & npm run start:new");
    process.exit(2);
  }
  const results = [];
  for (const t of TABLES) {
    const [o, n] = await Promise.all([get(OLD, t.path), get(NEW, t.path)]);
    results.push(reconcileTable(t, o, n));
  }
  const total = printReport(results);
  writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify(results, null, 2));
  console.log("Chi tiết đã ghi: harness/report.json");
  process.exit(total > 0 ? 1 : 0);
}
main();
