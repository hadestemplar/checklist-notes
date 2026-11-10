#!/usr/bin/env node
// 清单体笔记机检：node check-note.mjs <file> | --drift
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');

const OLD_PATTERNS = [
  ['关键词：', /\*\*关键词：/],
  ['缩进两格', /缩进两?格/],
  ['子层字母 a.', /\n\t?\t?[a-c]\. /],
  ['顿号编号 1、', /^\t*(\d+)、/m],
];

if (args[0] === '--drift') {
  const targets = [
    path.join(ROOT, 'SKILL.md'),
    path.join(ROOT, 'references', '清单体笔记-判据库-v1.4.md'),
    // 发布库版本：外部副本路径由环境变量提供（分号分隔），未设置时显式报告，不静默跳过
    ...(process.env.CHECK_NOTE_EXTRA || '').split(';').filter(Boolean),
  ];
  if (!process.env.CHECK_NOTE_EXTRA) {
    console.log('EXTRA_UNSET  未设置 CHECK_NOTE_EXTRA，本次只检查本仓库内副本');
  }
  let bad = 0;
  for (const f of targets) {
    if (!fs.existsSync(f)) { console.log('MISSING  ' + f); bad++; continue; }  // 2026-11-07: 静默跳过等于少查一份，改为计失败
    const t = fs.readFileSync(f, 'utf8');
    // 只看"规定性文本"：带禁止/反例/事故等标记的行属于合法提及，不算漂移
    const NEG = /禁止|禁用|绝不|不许|不写|反例|不得|命中|漂移|事故|不再|已废|改为/;
    const rows = t.split(/\r?\n/);
    for (const [name, re] of OLD_PATTERNS) {
      const hitLines = [];
      rows.forEach((ln, i) => {
        if (NEG.test(ln)) return;
        const re1 = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        if (re1.test(ln)) hitLines.push(i + 1);
      });
      if (hitLines.length) { bad += hitLines.length; console.log('DRIFT ' + hitLines.length + 'x [' + name + '] in ' + path.basename(f) + ' @' + hitLines.slice(0, 6).join(',')); }
    }
  }
  console.log(bad === 0 ? 'DRIFT_OK 0' : 'DRIFT_VIOLATIONS=' + bad);
  process.exit(bad === 0 ? 0 : 1);
}

const file = args[0];
if (!file || !fs.existsSync(file)) { console.error('usage: node check-note.mjs <note.md> | --drift'); process.exit(2); }
const raw = fs.readFileSync(file, 'utf8');
const lines = raw.split(/\r?\n/);

const body = raw.replace(/^---[\s\S]*?---\r?\n/, '');
const bLines = body.split(/\r?\n/);

const stats = { items: 0, subs: 0, keys: [], illegal: [], literalKeyword: 0, childBlank: 0, mainNoBlank: 0, deep: 0, boldHeading: [], annotation: 0 };
let section = '(head)';
const seen = new Map(); // section -> Set(label)

for (let i = 0; i < bLines.length; i++) {
  const ln = bLines[i];
  if (/^#{1,6}\s/.test(ln)) { section = ln.trim(); if (/\*\*/.test(ln)) stats.boldHeading.push(i + 1); continue; }
  if (/^\s*$/.test(ln)) continue;
  const m = ln.match(/^(\t*)([^\s].*)$/);
  const indent = m ? m[1].length : 0;
  const rest = m ? m[2] : ln;

  if (/^(\d+)、|^[-*+]\s|^\d+\)\s|^[a-z]\.\s/.test(rest)) stats.illegal.push(i + 1);
  if (/本节为归纳|编者归纳/.test(ln)) stats.annotation++;
  if (indent > 2) stats.deep++;

  const item = rest.match(/^(\d+)\.\s+\*\*(.+?)\*\*/);
  if (item) {
    const label = item[2].replace(/[：:]$/, '').trim();
    stats.keys.push(label);
    if (/^关键词$/.test(label)) stats.literalKeyword++;
    if (indent === 0) stats.items++; else stats.subs++;
    const key = section + '|' + indent;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(label);
  }
}

// 子项之间不空行：上一个子项与此子项之间出现空行
for (let i = 1; i < bLines.length; i++) {
  const cur = bLines[i], prev = bLines[i - 1];
  if (/^\t+\d+\.\s/.test(cur) && /^\s*$/.test(prev) && /^\t+\d+\.\s/.test(bLines[i - 2] || '')) stats.childBlank++;
  if (/^\d+\.\s+\*\*/.test(cur) && !/^\s*$/.test(prev) && /^\d+\.\s+\*\*/.test(prev)) stats.mainNoBlank++;
}

const repeats = [];
for (const [k, arr] of seen) {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  for (const [label, n] of c) if (n > 1 && !/^(待确认|说明|示例)$/.test(label)) repeats.push(k.split('|')[0] + ' :: ' + label + ' x' + n);
}

const uniq = new Set(stats.keys).size;
const violations =
  stats.illegal.length + stats.literalKeyword + stats.childBlank + stats.mainNoBlank +
  stats.deep + stats.boldHeading.length + repeats.length + stats.annotation;

console.log('FILE=' + path.basename(file));
console.log('ITEMS=' + stats.items + ' SUBS=' + stats.subs + ' LABELS=' + stats.keys.length + ' UNIQUE=' + uniq);
console.log('ILLEGAL_LIST=' + stats.illegal.length + (stats.illegal.length ? ' @' + stats.illegal.slice(0, 8).join(',') : ''));
console.log('LITERAL_KEYWORD=' + stats.literalKeyword);
console.log('CHILD_BLANK=' + stats.childBlank + ' MAIN_NO_BLANK=' + stats.mainNoBlank);
console.log('DEEP_LEVEL_GT3=' + stats.deep + ' BOLD_HEADING=' + stats.boldHeading.length);
console.log('ANNOTATION_LABEL=' + stats.annotation);
console.log('LABEL_REPEAT_IN_SECTION=' + repeats.length);
for (const r of repeats.slice(0, 10)) console.log('  - ' + r);
const dupWhole = stats.keys.length - uniq;
console.log('LABEL_DUP_WHOLE_DOC=' + dupWhole + ' (参考值，判定以分节重复为准)');
console.log(violations === 0 ? 'RESULT=PASS' : 'RESULT=FAIL violations=' + violations);
process.exit(violations === 0 ? 0 : 1);
