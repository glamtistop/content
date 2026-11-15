import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { localStore } from "@/lib/store/local";
import { brand, image, project } from "./fixtures";

describe("local store (this-device mode)", () => {
  it("persists and reopens drafts", async () => {
    const s1 = localStore("t-persist");
    await s1.saveBrand(brand());
    await s1.saveProject(project({ idea: "draft text", locked: { script: "edited" } }));
    const s2 = localStore("t-persist"); // a fresh connection, like a page refresh
    const p = await s2.getProject("p1");
    expect(p?.idea).toBe("draft text");
    expect(p?.locked.script).toBe("edited");
  });

  it("keeps brands separate and deletes media with its project", async () => {
    const s = localStore("t-delete");
    await s.saveProject(project({ id: "a", brandId: "b1" }));
    await s.saveProject(project({ id: "b", brandId: "b2" }));
    expect((await s.listProjects("b1")).map((p) => p.id)).toEqual(["a"]);
    const m = image({ projectId: "a" });
    await s.saveMediaMeta(m);
    await s.putMediaBlob(m, new Blob(["x"]));
    expect(await s.getMediaBlob(m)).toBeDefined();
    await s.deleteProject("a");
    expect(await s.getMediaBlob(m)).toBeUndefined();
    expect(await s.listMedia("a")).toEqual([]);
    expect((await s.listProjects("b2")).length).toBe(1);
    await s.deleteEverything();
    expect(await s.listProjects("b2")).toEqual([]);
  });
});
