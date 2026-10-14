import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { isProtectedAddressBook, pinProtectedAddressBook } from "./protected-book";

test("전체 명단을 최상단에 고정하고 나머지 순서와 원본 배열을 유지한다", () => {
  const books = [{ name: "최신 주소록" }, { name: "전체 명단" }, { name: "오래된 주소록" }];
  assert.deepEqual(pinProtectedAddressBook(books).map(book => book.name), ["전체 명단", "최신 주소록", "오래된 주소록"]);
  assert.equal(books[0].name, "최신 주소록");
  assert.equal(isProtectedAddressBook({ name: " 전체 명단 " }), true);
  assert.equal(isProtectedAddressBook({ name: "전체 명단 사본" }), false);
});

test("기존 전체 주소록의 연락처·이력을 보존하며 관리자 DB 요청도 삭제·이름 변경을 막는다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role service_role;
      create table address_books(id int primary key, workspace_id int not null, name text not null, contact_count int);
      create table address_book_contacts(id int primary key, address_book_id int references address_books(id) on delete cascade, phone text);
      create table message_history(id int primary key, address_book_id int references address_books(id) on delete cascade);
      insert into address_books values (1,1,'비즈업-전체-1013',27444), (2,1,'일반 주소록',1);
      insert into address_book_contacts values (1,1,'01012345678');
      insert into message_history values (1,1);
      grant select, update, delete, insert on all tables in schema public to authenticated, service_role;
    `);
    const migration = (await readdir("supabase/migrations")).find(name => name.endsWith("_protect_all_contacts_book.sql"))!;
    await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
    assert.deepEqual((await db.query("select * from address_books where id=1")).rows, [{ id: 1, workspace_id: 1, name: "전체 명단", contact_count: 27444 }]);
    for (const role of ["authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("delete from address_books where id=1"), /삭제할 수 없습니다/);
      await assert.rejects(db.exec("update address_books set name='다른 이름' where id=1"), /변경할 수 없습니다/);
      await assert.rejects(db.exec("update address_books set workspace_id=2 where id=1"), /변경할 수 없습니다/);
      await assert.rejects(db.exec("insert into address_books values(3,1,'전체 명단',0)"), /duplicate key/);
      await db.exec("update address_books set contact_count=27445 where id=1; reset role;");
    }
    assert.equal((await db.query("select * from address_book_contacts")).rows.length, 1);
    assert.equal((await db.query("select * from message_history")).rows.length, 1);
    await db.exec("update address_books set name='일반 이름 변경' where id=2; delete from address_books where id=2;");
    assert.equal((await db.query("select * from address_books")).rows.length, 1);
  } finally { await db.close(); }
});
