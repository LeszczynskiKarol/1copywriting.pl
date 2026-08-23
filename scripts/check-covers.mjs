#!/usr/bin/env node
/**
 * Sprawdza, czy kazdy wpis bloga ma okladke, ktora naprawde lezy w public/.
 *
 * Uruchamiany automatycznie przez `npm run build` (hook `prebuild`), wiec
 * artykul bez pliku okladki nie przejdzie buildu i nie trafi na produkcje.
 * Mozna tez odpalic recznie: `npm run check:covers`.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = join(ROOT, "src", "content", "blog");
const PUBLIC_DIR = join(ROOT, "public");

/** Wyciaga wartosc pojedynczego pola z frontmattera (bez pelnego parsera YAML). */
function frontmatterField(source, field) {
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const line = fm[1].match(new RegExp(`^${field}:[ \\t]*(.+)$`, "m"));
  if (!line) return null;
  return line[1].trim().replace(/^["']|["']$/g, "");
}

const problems = [];
const files = readdirSync(BLOG_DIR).filter((f) => /\.mdx?$/.test(f));

for (const file of files) {
  const slug = file.replace(/\.mdx?$/, "");
  const source = readFileSync(join(BLOG_DIR, file), "utf8");
  const image = frontmatterField(source, "image");
  const imageAlt = frontmatterField(source, "imageAlt");

  if (!image) {
    problems.push(`${slug} - brak pola "image:" we frontmatterze`);
    continue;
  }
  if (!image.startsWith("/")) {
    problems.push(
      `${slug} - "image: ${image}" musi byc sciezka od roota, np. /images/blog/${slug}.jpg`
    );
    continue;
  }
  if (!existsSync(join(PUBLIC_DIR, image))) {
    problems.push(
      `${slug} - brak pliku public${image} (okladka wyswietli sie jako pusta ramka)`
    );
    continue;
  }
  if (!imageAlt) {
    problems.push(
      `${slug} - brak pola "imageAlt:" (alt okladki, wazny dla SEO i dostepnosci)`
    );
  }
}

if (problems.length > 0) {
  const label = problems.length === 1 ? "problem" : "problemow";
  console.error(`\nBLAD: okladki wpisow - ${problems.length} ${label}:\n`);
  for (const p of problems) console.error(`  * ${p}`);
  console.error(
    `\nDodaj brakujacy plik JPG do public/images/blog/ (1920x822, ok. 2.33:1)\n` +
      `albo popraw sciezke w polu "image:". Build przerwany.\n`
  );
  process.exit(1);
}

console.log(
  `OK: okladki - ${files.length} wpisow, kazdy ma istniejacy plik obrazka.`
);
