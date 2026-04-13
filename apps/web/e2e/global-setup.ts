import { ensureE2eDatabase } from "./helpers/seed-data";

export default function globalSetup() {
  ensureE2eDatabase();
}
