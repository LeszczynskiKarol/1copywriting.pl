import { defineCollection, z } from "astro:content";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/**
 * Okladka wpisu. Musi byc sciezka od roota (np. /images/blog/slug.jpg),
 * a plik musi realnie istniec w public/ — inaczej na liscie wpisow i w naglowku
 * artykulu renderuje sie pusta ramka. Blad lapiemy juz przy `astro dev`/`astro build`.
 */
const coverImage = z
  .string()
  .startsWith("/", 'Sciezka okladki musi zaczynac sie od "/" (np. /images/blog/slug.jpg)')
  .refine((p) => existsSync(join(PUBLIC_DIR, p)), (p) => ({
    message: `Brak pliku public${p} — dodaj okladke (1920x822 JPG) do public/images/blog/ albo popraw sciezke.`,
  }));

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default("Redakcja 1copywriting.pl"),
    category: z.string(),
    silo: z.string(),
    keyword: z.string(),
    tags: z.array(z.string()).default([]),
    image: coverImage,
    imageAlt: z.string().min(1),
    readingTime: z.number().optional(),
    priority: z.string().optional(),
    relatedPosts: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
