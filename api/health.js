// Health check for the Klaudius platform API.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  let tables = null;
  try {
    await db.ready();
    const rows = await db.query("select tablename from pg_tables where schemaname='public' order by tablename");
    tables = rows.map((r) => r.tablename);
  } catch {}
  return db.json(res, 200, { ok: true, service: 'klaudius-clone', tables });
};
