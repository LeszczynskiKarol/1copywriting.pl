export const SITE = {
  title: "1copywriting.pl",
  description:
    "Kompletny przewodnik po copywritingu. Definicje, zasady, formuły, techniki pisania i praktyczne poradniki. Wszystko o copywritingu w jednym miejscu.",
  url: "https://www.1copywriting.pl",
  author: "1copywriting.pl",
  locale: "pl_PL",
  lang: "pl",
};

export const NAV_ITEMS = [
  { label: "Copywriting", href: "/co-to-jest-copywriting/" },
  { label: "Rodzaje", href: "/rodzaje-copywritingu/" },
  { label: "Zasady", href: "/zasady-copywritingu/" },
  { label: "Formuły", href: "/formuly-copywriterskie/" },
  { label: "Jak pisać", href: "/jak-pisac/" },
  { label: "Słownik", href: "/slownik-copywritera/" },
  { label: "Przykłady", href: "/przyklady-copywritingu/" },
  { label: "Blog", href: "/blog/" },
];

export const SILOS = [
  {
    slug: "co-to-jest-copywriting",
    title: "Co to jest copywriting",
    description:
      "Definicje, wyjaśnienia i wprowadzenie do świata copywritingu.",
    icon: "📖",
    color: "#E8453C",
  },
  {
    slug: "rodzaje-copywritingu",
    title: "Rodzaje copywritingu",
    description: "Typy, odmiany i specjalizacje w copywritingu.",
    icon: "🧩",
    color: "#F59E0B",
  },
  {
    slug: "zasady-copywritingu",
    title: "Zasady copywritingu",
    description: "Fundamentalne zasady i reguły dobrego tekstu.",
    icon: "⚡",
    color: "#10B981",
  },
  {
    slug: "slownik-copywritera",
    title: "Słownik copywritera",
    description: "100+ pojęć i terminów, które musisz znać.",
    icon: "📚",
    color: "#6366F1",
  },
  {
    slug: "historia-copywritingu",
    title: "Historia copywritingu",
    description: "Od ogłoszeń prasowych do AI — ewolucja copywritingu.",
    icon: "🏛️",
    color: "#8B5CF6",
  },
  {
    slug: "elementy-tekstu",
    title: "Elementy tekstu",
    description: "Nagłówki, CTA, lead — anatomia tekstu copywriterskiego.",
    icon: "🔍",
    color: "#EC4899",
  },
  {
    slug: "jezyk-i-styl",
    title: "Język i styl",
    description: "Power words, storytelling, ton of voice i techniki językowe.",
    icon: "✍️",
    color: "#14B8A6",
  },
  {
    slug: "bledy-w-copywritingu",
    title: "Błędy w copywritingu",
    description: "Najczęstsze pomyłki i pułapki — czego unikać.",
    icon: "⚠️",
    color: "#F97316",
  },
  {
    slug: "formuly-copywriterskie",
    title: "Formuły copywriterskie",
    description: "AIDA, PAS, BAB i 15+ sprawdzonych schematów pisania.",
    icon: "🧪",
    color: "#0EA5E9",
  },
  {
    slug: "proces-i-warsztat",
    title: "Proces i warsztat",
    description: "Brief, research, draft, edycja — workflow copywritera.",
    icon: "⚙️",
    color: "#64748B",
  },
  {
    slug: "przyklady-copywritingu",
    title: "Przykłady",
    description: "Analiza prawdziwych tekstów, case studies i inspiracje.",
    icon: "💡",
    color: "#EAB308",
  },
  {
    slug: "jak-pisac",
    title: "Jak pisać",
    description:
      "Praktyczne poradniki: nagłówki, CTA, posty, e-maile, reklamy.",
    icon: "🚀",
    color: "#E8453C",
  },
];

export const SCHEMA_ORG = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.title,
  url: SITE.url,
  description: SITE.description,
  inLanguage: "pl",
  publisher: {
    "@type": "Organization",
    name: SITE.title,
    url: SITE.url,
  },
};
