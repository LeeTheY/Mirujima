import process from "node:process";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localRestoreConfig } from "./deployment-config.mjs";

// This rehearsal never connects to a remote database, starts providers, or drops a database.
let artifact;
let stage = "local-connection-guard";
try {
  const config = localRestoreConfig(process.env);
  const target = `mirujima_restore_${randomUUID().replaceAll("-", "")}`;
  artifact = mkdtempSync(join(tmpdir(), "mirujima-restore-"));
  chmodSync(artifact, 0o700);
  const env = { ...process.env, PGHOST: config.host, PGPORT: config.port,
    PGUSER: config.user, PGDATABASE: config.database, PGCONNECT_TIMEOUT: "5" };
  const run = (command, args, database = config.database, input) => execFileSync(command, args, {
    env: { ...env, PGDATABASE: database }, input, encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"], timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  const sql = (text, database = config.database) => run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], database).trim();
  const tables = JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname) order by n.nspname,c.relname),'[]')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth') and c.relkind='r'`));
  const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
  const snapshot = (database) => {
    const rows = tables.map((table) => ({ ...table, fingerprint: sql(`select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),''))) from ${quote(table.schema)}.${quote(table.name)} t`, database) }));
    const definitions = sql(`select jsonb_build_object(
      'tables',(select jsonb_agg(row_to_json(t) order by t.schema,t.name) from (
        select n.nspname schema,c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
        (select jsonb_agg(row_to_json(a) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) acl
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r') t),
      'policies',(select jsonb_agg(row_to_json(p) order by p.schemaname,p.tablename,p.policyname) from pg_policies p where schemaname in ('public','auth')),
      'functions',(select jsonb_agg(row_to_json(f) order by f.signature) from (
        select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,
        md5(pg_get_functiondef(p.oid)) definition,
        (select jsonb_agg(row_to_json(a) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) acl
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','extensions') and p.prokind in ('f','p')) f),
      'constraints',(select jsonb_agg(row_to_json(k) order by k.schema,k.table_name,k.name) from (
        select n.nspname schema,c.relname table_name,k.conname name,k.contype type,pg_get_constraintdef(k.oid) definition,k.convalidated validated
        from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth')) k),
      'indexes',(select jsonb_agg(row_to_json(i) order by i.schemaname,i.tablename,i.indexname) from pg_indexes i where schemaname in ('public','auth')),
      'triggers',(select jsonb_agg(row_to_json(t) order by t.schema,t.table_name,t.name) from (
        select n.nspname schema,c.relname table_name,t.tgname name,pg_get_triggerdef(t.oid) definition
        from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and not t.tgisinternal) t)
    )`, database);
    const parsed = JSON.parse(definitions);
    for (const constraint of parsed.constraints ?? []) {
      if (constraint.type !== "c") continue;
      // PostgreSQL flattens associative AND groups when parsing dump SQL.
      // Round-trip CHECK expressions with the same parser in a rollback-only
      // temporary table; no original table or persisted record is modified.
      constraint.definition = sql(`begin;
        create temporary table mirujima_check_roundtrip (like ${quote(constraint.schema)}.${quote(constraint.table_name)});
        alter table pg_temp.mirujima_check_roundtrip add constraint mirujima_roundtrip ${constraint.definition.replace(/ NOT VALID$/, "")} not valid;
        select pg_get_constraintdef(oid) from pg_constraint where conrelid='pg_temp.mirujima_check_roundtrip'::regclass and conname='mirujima_roundtrip';
        rollback;`, database).replace(/ NOT VALID$/, "");
    }
    return { rows, definitions: parsed };
  };
  stage = "source-snapshot";
  const before = snapshot(config.database);
  const dump = join(artifact, "database.dump");
  stage = "backup";
  run("pg_dump", ["--format=custom", "--file", dump]);
  chmodSync(dump, 0o600);
  stage = "create-isolated-target";
  run("createdb", ["--template=template0", target]);
  // No --clean: only the freshly created target can receive the archive.
  stage = "restore";
  run("pg_restore", ["--exit-on-error", "--dbname", target, dump], target);
  stage = "compare-snapshot";
  const after = snapshot(target);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    writeFileSync(join(artifact, "source-snapshot.json"), JSON.stringify(before), { mode: 0o600 });
    writeFileSync(join(artifact, "restored-snapshot.json"), JSON.stringify(after), { mode: 0o600 });
    throw new Error("restore mismatch");
  }
  let assertions = 0;
  const tests = readdirSync("supabase/tests/database").filter((name) => name.endsWith(".sql"))
    .sort().map((name) => join("supabase/tests/database", name));
  for (const path of tests) {
    stage = `sql-regression:${path}`;
    // A plain PostgreSQL fixture preloads pgTAP functions; a full Supabase restore has the extension.
    const hasExtension = sql("select exists(select 1 from pg_extension where extname='pgtap')", target) === "t";
    const source = readFileSync(path, "utf8");
    const input = hasExtension ? source : source.replace("create extension if not exists pgtap with schema extensions;", "-- pgTAP functions already restored");
    const output = run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At"], target, input);
    if (/^not ok\b/m.test(output) || !/^ok \d+/m.test(output) || !/^1\.\.\d+/m.test(output)) {
      writeFileSync(join(artifact, "failed-sql.log"), output, { mode: 0o600 });
      throw new Error("SQL regression failed");
    }
    const planned = Number(output.match(/^1\.\.(\d+)/m)[1]);
    const actual = (output.match(/^ok \d+/gm) ?? []).length;
    if (planned !== actual) throw new Error("SQL assertion count mismatch");
    assertions += actual;
  }
  // Tests must roll back; ensure original and restored records remain unchanged.
  stage = "rollback-and-source-preservation";
  if (JSON.stringify(before) !== JSON.stringify(snapshot(target))
    || JSON.stringify(before) !== JSON.stringify(snapshot(config.database))) throw new Error("fixture leaked");
  const report = { scope: "local-postgresql-only", verifiedAt: new Date().toISOString(),
    restoredDatabase: target, sourceUnchanged: true, rowHashesAndSecurityDefinitionsMatch: true,
    tablesChecked: tables.length, sqlFiles: tests.length, assertions, providersInvoked: false,
    limitations: ["same-cluster roles reused", "not Supabase Auth/API/Realtime/PITR verification"] };
  writeFileSync(join(artifact, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ ...report, artifact }, null, 2) + "\n");
} catch (error) {
  if (artifact && error?.stderr) writeFileSync(join(artifact, "private-error.log"), error.stderr, { mode: 0o600 });
  process.stderr.write(`로컬 복원 검증 실패 (${stage}). 원본 DB는 삭제하지 않습니다.${artifact ? ` 보호된 작업 경로: ${artifact}` : ""}\n`);
  process.exitCode = 1;
}
