import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { withTransaction } from "./client";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (v INTEGER)");
  const values = () => (db.prepare("SELECT v FROM t ORDER BY v").all() as { v: number }[]).map((row) => row.v);
  return { db, values };
}

describe("withTransaction", () => {
  it("commits, and rolls everything back on an error", () => {
    const { db, values } = setup();
    withTransaction(db, () => db.exec("INSERT INTO t VALUES (1)"));
    expect(() =>
      withTransaction(db, () => {
        db.exec("INSERT INTO t VALUES (2)");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(values()).toEqual([1]);
  });

  it("nests: an inner failure that is caught undoes only the inner step", () => {
    const { db, values } = setup();
    withTransaction(db, () => {
      db.exec("INSERT INTO t VALUES (1)");
      try {
        withTransaction(db, () => {
          db.exec("INSERT INTO t VALUES (2)");
          throw new Error("inner");
        });
      } catch {
        // The outer change carries on without step 2.
      }
      db.exec("INSERT INTO t VALUES (3)");
    });
    expect(values()).toEqual([1, 3]);
  });

  it("nests: an outer failure undoes inner steps that had succeeded", () => {
    const { db, values } = setup();
    expect(() =>
      withTransaction(db, () => {
        withTransaction(db, () => db.exec("INSERT INTO t VALUES (1)"));
        withTransaction(db, () => db.exec("INSERT INTO t VALUES (2)"));
        throw new Error("outer");
      }),
    ).toThrow("outer");
    expect(values()).toEqual([]);

    // And the connection is usable afterwards.
    withTransaction(db, () => db.exec("INSERT INTO t VALUES (9)"));
    expect(values()).toEqual([9]);
  });
});
