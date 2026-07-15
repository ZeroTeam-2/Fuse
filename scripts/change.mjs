#!/usr/bin/env node
// Обёртки над рутинными шагами процесса разработки (см. .github/CONTRIBUTING.md).
// Цель — убрать ручной ввод там, где он чувствителен к формату: имя ветки
// выводится из имени папки change, коммит стейджит только openspec/, сообщение
// формируется по conventional-commits и проходит commitlint.
//
//   node scripts/change.mjs start   <change-id>   → ветка + первый коммит-спека
//   node scripts/change.mjs archive [change-id]   → openspec archive + коммит

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CHANGES_DIR = "openspec/changes";

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function capture(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function activeChanges() {
  if (!existsSync(CHANGES_DIR)) return [];
  return readdirSync(CHANGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "archive")
    .map((d) => d.name);
}

function assertChangeExists(id) {
  if (!id) {
    const list = activeChanges();
    die(
      `Не указан change-id.\n  Активные change:\n${
        list.map((c) => `    ${c}`).join("\n") || "    (нет)"
      }\n\n  Использование: pnpm change:start <change-id>`,
    );
  }
  if (!existsSync(join(CHANGES_DIR, id, "proposal.md"))) {
    die(
      `Нет ${CHANGES_DIR}/${id}/proposal.md.\n` +
        `  Сначала создайте change: openspec (/opsx:new) или /opsx:propose.`,
    );
  }
}

function openspec(args) {
  try {
    run("openspec", args);
  } catch {
    die(
      `Команда 'openspec' недоступна или завершилась с ошибкой.\n` +
        `  Установите CLI: npm i -g @fission-ai/openspec`,
    );
  }
}

function currentBranch() {
  return capture("git branch --show-current");
}

function start(id) {
  assertChangeExists(id);

  console.log(`\n→ Валидация change '${id}'…`);
  openspec(["change", "validate", id, "--strict"]);

  const branch = `change/${id}`;
  const branches = capture("git branch --list " + branch);

  if (currentBranch() === branch) {
    console.log(`→ Уже на ветке ${branch}.`);
  } else if (branches) {
    console.log(`→ Переключаюсь на существующую ветку ${branch}.`);
    run("git", ["switch", branch]);
  } else {
    if (currentBranch() !== "develop") {
      die(
        `Ветку change/* заводим от develop, а сейчас вы на '${currentBranch()}'.\n` +
          `  Выполните: git switch develop && git pull`,
      );
    }
    console.log(`→ Создаю ветку ${branch} от develop.`);
    run("git", ["switch", "-c", branch]);
  }

  // Стейджим ТОЛЬКО артефакты спеки — так первый коммит не заденет код (docs-first).
  run("git", ["add", "--", join(CHANGES_DIR, id)]);

  const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
  if (!staged) {
    console.log(`\n✓ Спека уже закоммичена. Ветка ${branch} готова.`);
  } else {
    run("git", ["commit", "-m", `docs(openspec): add change ${id}`]);
    console.log(`\n✓ Первый коммит-спека создан на ветке ${branch}.`);
  }

  console.log(`\n  Дальше: git push -u origin ${branch}`);
  console.log(`  Пуш поднимет issue и черновой PR автоматически.\n`);
}

function archive(idArg) {
  const branch = currentBranch();
  let id = idArg;

  if (!id && branch.startsWith("change/")) id = branch.slice("change/".length);
  if (!id) die("Не указан change-id и текущая ветка не change/*.");

  if (branch !== `change/${id}`) {
    die(`Архивировать '${id}' нужно на ветке change/${id}, а вы на '${branch}'.`);
  }

  console.log(`\n→ openspec archive ${id}…`);
  openspec(["archive", id]);

  run("git", ["add", "--", "openspec"]);
  const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
  if (!staged) die("openspec archive не дал изменений — возможно, уже заархивирован.");

  run("git", ["commit", "-m", `chore(openspec): archive ${id}`]);
  console.log(`\n✓ Change '${id}' заархивирован, дельты влиты в openspec/specs/.`);
  console.log(`\n  Дальше: git push, затем снимите PR с черновика (Ready for review).\n`);
}

const [, , sub, id] = process.argv;
switch (sub) {
  case "start":
    start(id);
    break;
  case "archive":
    archive(id);
    break;
  default:
    die("Использование: node scripts/change.mjs <start|archive> [change-id]");
}
