import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const tbl = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
console.log("TABLES:", tbl.map(t => t.table_name).join(", "));
const exists = tbl.find(t => t.table_name === 'scripts');
if (!exists) { console.log("!!! scripts table MISSING"); process.exit(0); }
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='scripts' ORDER BY ordinal_position`;
console.log("SCRIPTS COLS:", cols.map(c => c.column_name + ':' + c.data_type).join(", "));
const cnt = await sql`SELECT count(*)::int AS n FROM scripts`;
console.log("SCRIPTS COUNT:", cnt[0].n);
const recent = await sql`SELECT id, user_id, LEFT(tema,40) AS tema, LEFT(titulo,40) AS titulo, created_at FROM scripts ORDER BY created_at DESC LIMIT 5`;
console.log("LAST 5:", JSON.stringify(recent, null, 2));
