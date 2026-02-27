import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pg = require("/home/brian/projects/chatterbox/node_modules/.pnpm/node_modules/pg");

const client = new pg.Client(
  "postgresql://chatterbox:chatterbox@localhost:5432/chatterbox",
);
await client.connect();

const query =
  process.argv[2] ||
  'SELECT id, title FROM "Conversation" ORDER BY "updatedAt" DESC';
const result = await client.query(query);

const field = process.argv[3]; // optional: print only this field as raw text
for (const row of result.rows) {
  if (field && row[field] !== undefined) {
    console.log(
      typeof row[field] === "string"
        ? row[field]
        : JSON.stringify(row[field], null, 2),
    );
  } else {
    console.log(JSON.stringify(row));
  }
}

await client.end();
