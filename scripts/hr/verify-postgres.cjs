/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS verification harness. */
/* Isolated native PostgreSQL verification. Dependencies live in ignored tmp/hr-native. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createServer } = require('node:net');
const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, 'tmp/hr-native');
const { Pool } = require(path.join(runtime, 'node_modules/pg'));
const bin = path.join(runtime, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const backupBin = process.env.HR_POSTGRES_TOOLS_BIN || bin;
const backupTools = ['pg_dump', 'pg_restore', 'createdb'];
function run(program, args) {
  const executable = path.join(backupTools.includes(program) ? backupBin : bin, program + '.exe');
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`${program}: ${result.error || result.stderr || result.stdout}`);
}
async function availablePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function main() {
  for (const program of backupTools) {
    await fs.access(path.join(backupBin, program + '.exe')).catch(() => {
      throw new Error(`Missing ${program}. Set HR_POSTGRES_TOOLS_BIN to the bin directory of an official PostgreSQL 18 Windows archive.`);
    });
  }
  const data = await fs.mkdtemp(path.join(runtime, 'data-'));
  const port = await availablePort();
  let pool, started = false;
  const evidence = { engine: 'native PostgreSQL 18', connections: 20, checks: [], measurements: {} };
  try {
    run('initdb', ['-D', data, '-U', 'hr_test', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
    run('pg_ctl', ['-D', data, '-l', path.join(data, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    pool = new Pool({ host: '127.0.0.1', port, user: 'hr_test', database: 'postgres', max: 20 });
    await pool.query(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const file of (await fs.readdir(path.join(root, 'supabase/migrations'))).filter(name => /^20260914\d+_hr_/.test(name)).sort()) {
      await pool.query(await fs.readFile(path.join(root, 'supabase/migrations', file), 'utf8'));
    }
    await pool.query("insert into auth.users select gen_random_uuid(),'native-'||n||'@example.test' from generate_series(1,100) n");
    const accounts = (await pool.query('select * from auth.users order by email')).rows;
    const org = (await pool.query("select public.hr_bootstrap($1,'Test admin','2020-01-01') id", [accounts[0].id])).rows[0].id;
    await pool.query("insert into hr.employees(organization_id,auth_id,email,name,employment_start_date) select $1,id,email,'Test employee','2020-01-01' from auth.users where id<>$2", [org, accounts[0].id]);
    const employees = (await pool.query('select * from hr.employees order by email')).rows;
    async function session(index, sql, args) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [accounts[index].id]);
        await client.query('set local role authenticated');
        const result = await client.query(sql, args);
        await client.query('commit');
        return result.rows[0].result;
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    }
    const command = (index, action, body, key = randomUUID()) => session(index, 'select public.hr_command($1,$2::jsonb,$3::uuid) result', [action, JSON.stringify(body), key]);
    const query = (index, resource, filter = {}) => session(index, 'select public.hr_query($1,$2::jsonb) result', [resource, JSON.stringify(filter)]);
    const ins = await Promise.all(Array.from({ length: 20 }, () => command(1, 'attendance.in', {})));
    assert.equal(new Set(ins.map(item => item.id)).size, 1);
    assert.equal(new Set(ins.map(item => item.check_in_at)).size, 1);
    const outs = await Promise.all(Array.from({ length: 20 }, () => command(1, 'attendance.out', { id: ins[0].id, expected_version: ins[0].version })));
    assert.equal(new Set(outs.map(item => item.check_out_at)).size, 1);
    evidence.checks.push('20 simultaneous check-ins and check-outs retain one record and original timestamps');
    const task = await command(1, 'task.create', { title: 'Concurrent task', assignee_id: employees[1].id });
    const race = await Promise.allSettled([
      command(1, 'task.update', { id: task.id, expected_version: 1, title: 'Updated' }),
      command(0, 'task.transfer', { id: task.id, expected_version: 1, new_assignee_id: employees[2].id, handover_note: 'Transfer' }),
    ]);
    assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(race.find(item => item.status === 'rejected').reason.code, 'PT409');
    assert.equal((await query(0, 'task', { id: task.id })).task.version, 2);
    evidence.checks.push('concurrent edit versus transfer: one success, one version conflict');
    const monday = (await pool.query("select (hr.today()+(8-extract(isodow from hr.today())::integer))::text as work_date")).rows[0].work_date;
    const leaveBody = { start_date: monday, end_date: monday, unit: 'full', private_reason: 'Test' };
    const leaves = await Promise.allSettled(Array.from({ length: 20 }, () => command(2, 'leave.create', leaveBody)));
    assert.equal(leaves.filter(item => item.status === 'fulfilled').length, 1);
    for (const result of leaves.filter(item => item.status === 'rejected')) assert.equal(result.reason.code, 'PT409');
    const key = randomUUID(), body = { title: 'Idempotent task', assignee_id: employees[3].id };
    const replays = await Promise.all(Array.from({ length: 20 }, () => command(3, 'task.create', body, key)));
    assert.equal(new Set(replays.map(item => item.id)).size, 1);
    await assert.rejects(command(3, 'task.create', { ...body, title: 'Mismatch' }, key), { code: 'PT409' });
    evidence.checks.push('20 overlapping leave requests create one leave; 20 retries create one task; changed retry body conflicts');
    await Promise.all(Array.from({ length: 20 }, () => pool.query('select public.hr_process_notifications(100)')));
    assert.equal((await pool.query('select count(*)::int n from (select event_id,recipient_id from hr.notifications group by 1,2 having count(*)>1) duplicate')).rows[0].n, 0);
    evidence.checks.push('20 notification workers produce no duplicate recipient events');
    await pool.query(`with staff as (select id,row_number() over(order by email) n from hr.employees), chief as (select id from hr.employees where role='admin')
      insert into hr.tasks(organization_id,title,creator_id,assignee_id,planned_date,status)
      select $1,'Load task '||g.n,chief.id,(select id from staff where staff.n=(g.n%100)+1),hr.today()-g.n%30,
      case g.n%4 when 0 then 'ready' when 1 then 'doing' when 2 then 'done' else 'cancelled' end
      from generate_series(1,10000) g(n) cross join chief`, [org]);
    async function measure(name, work) {
      const samples = [];
      for (let batch = 0; batch < 3; batch++) await Promise.all(Array.from({ length: 20 }, async (_, i) => {
        const start = performance.now(); await work(i + batch * 20); samples.push(performance.now() - start);
      }));
      samples.sort((a, b) => a - b);
      evidence.measurements[name] = { count: samples.length, p95_ms: Math.round(samples[56]), max_ms: Math.round(samples.at(-1)) };
      console.log(name, evidence.measurements[name]);
    }
    await measure('employee_task_list', i => query(i, 'tasks', { scope: 'assigned', status: 'all' }));
    await measure('admin_dashboard', () => query(0, 'admin', { limit: 100 }));
    const tasks = (await pool.query("select id,version from hr.tasks where title like 'Load task %' order by id limit 60")).rows;
    await measure('task_update', i => command(0, 'task.update', { id: tasks[i].id, expected_version: tasks[i].version, title: `Changed ${i}` }));
    await measure('check_in', i => command(i, 'attendance.in', {}));
    await pool.end(); pool = null;
    run('pg_ctl', ['-D', data, '-w', 'stop']); started = false;
    run('pg_ctl', ['-D', data, '-l', path.join(data, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true;
    pool = new Pool({ host: '127.0.0.1', port, user: 'hr_test', database: 'postgres', max: 20 });
    assert.equal((await query(3, 'task', { id: replays[0].id })).task.id, replays[0].id);
    assert.equal((await query(2, 'leaves', { from: monday, to: monday })).items.length, 1);
    evidence.checks.push('PostgreSQL server stop/start and new authenticated sessions retain tasks and leaves');
    const expectedCounts = (await pool.query(`select
      (select count(*)::int from hr.tasks) tasks,
      (select count(*)::int from hr.attendance) attendance,
      (select count(*)::int from hr.leaves) leaves,
      (select count(*)::int from hr.employees) employees`)).rows[0];
    const backupPath = path.join(data, 'hr-test-backup.dump');
    const connectionArgs = ['-h', '127.0.0.1', '-p', String(port), '-U', 'hr_test'];
    run('pg_dump', [...connectionArgs, '-d', 'postgres', '-Fc', '-f', backupPath]);
    run('createdb', [...connectionArgs, 'hr_restore']);
    run('pg_restore', [...connectionArgs, '--exit-on-error', '-d', 'hr_restore', backupPath]);
    await pool.end();
    pool = new Pool({ host: '127.0.0.1', port, user: 'hr_test', database: 'hr_restore', max: 20 });
    const restoredCounts = (await pool.query(`select
      (select count(*)::int from hr.tasks) tasks,
      (select count(*)::int from hr.attendance) attendance,
      (select count(*)::int from hr.leaves) leaves,
      (select count(*)::int from hr.employees) employees`)).rows[0];
    assert.deepEqual(restoredCounts, expectedCounts);
    assert.equal((await query(3, 'task', { id: replays[0].id })).task.id, replays[0].id);
    assert.equal((await query(2, 'leaves', { from: monday, to: monday })).items.length, 1);
    const workDate = ins[0].work_date;
    const records = await query(1, 'records', { from: workDate, to: workDate });
    assert.equal(records.days[0].attendance.check_in_at, ins[0].check_in_at);
    await assert.rejects(query(4, 'task', { id: replays[0].id }), { code: 'PT404' });
    await assert.rejects(session(4, 'select * from hr.employees', []), { code: '42501' });
    const restoredTask = await command(0, 'task.create', { title: 'After restore', assignee_id: employees[4].id });
    await pool.query('select public.hr_process_notifications(500)');
    const notifications = await query(4, 'notifications');
    assert.equal(notifications.items.filter(item => item.entity_id === restoredTask.id && item.event_type === 'task.assigned').length, 1);
    evidence.checks.push('pg_dump/pg_restore into a separate database preserves records and permissions; new changes and notification delivery work after restore');
    evidence.restored_record_counts = restoredCounts;
    evidence.measured_at = new Date().toISOString();
    await fs.mkdir(path.join(root, 'tmp/hr-browser'), { recursive: true });
    await fs.writeFile(path.join(root, 'tmp/hr-browser/native-postgres.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    for (const [name, result] of Object.entries(evidence.measurements)) {
      assert.ok(result.p95_ms <= 2000, `${name}: p95 ${result.p95_ms}ms exceeds 2 seconds; full measurements were saved`);
    }
  } finally {
    if (pool) await pool.end();
    if (started) run('pg_ctl', ['-D', data, '-w', 'stop']);
    // Retain this isolated test database and log for inspection; never touch a configured application DB.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
