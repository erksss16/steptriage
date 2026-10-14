import Dexie, { type EntityTable } from "dexie";
import type { Tutorial, Session, Report } from "./core/model";
export type State = {
  tutorials: Tutorial[];
  sessions: Session[];
  reports: Report[];
};
const db = new Dexie("steptriage") as Dexie & {
  state: EntityTable<{ id: string; value: State }, "id">;
};
db.version(1).stores({ state: "id" });
export async function loadState() {
  return (await db.state.get("workspace"))?.value;
}
export async function saveState(value: State) {
  await db.state.put({ id: "workspace", value });
}
