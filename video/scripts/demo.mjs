// Voice a lesson and render it to out/<id>.mp4.
// Usage: npm run demo -- lessons/substitution.json   (add --still=<frame> to render one frame as a PNG instead)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const lessonArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const still = process.argv.find((a) => a.startsWith("--still="))?.split("=")[1];
if (!lessonArg) { console.error("usage: npm run demo -- lessons/<id>.json [--still=<frame>]"); process.exit(1); }

const python = process.env.PYTHON || path.resolve(root, "../.venv/bin/python");
const lessonFile = path.resolve(root, lessonArg);
const id = JSON.parse(fs.readFileSync(lessonFile, "utf8")).id;

execFileSync(python, ["-I", "scripts/tts.py", lessonFile], { cwd: root, stdio: "inherit" });
const props = path.join(root, "src/data", `${id}.props.json`);
fs.writeFileSync(props, JSON.stringify({ lesson: JSON.parse(fs.readFileSync(path.join(root, "src/data", `${id}.json`), "utf8")) }));
fs.mkdirSync(path.join(root, "out"), { recursive: true });
const bin = path.join(root, "node_modules/.bin/remotion");
const args = still
  ? ["still", "src/index.ts", "Lesson", `out/${id}-${still}.png`, `--props=${props}`, `--frame=${still}`]
  : ["render", "src/index.ts", "Lesson", `out/${id}.mp4`, `--props=${props}`];
execFileSync(bin, args, { cwd: root, stdio: "inherit" });
