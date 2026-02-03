/// <reference path="../.astro/types.d.ts" />

// Google Analytics gtag function
declare function gtag(...args: any[]): void;

// Window extensions for analytics and cookies
interface Window {
  dataLayer: any[];
  gtag: typeof gtag;
  openCookieSettings: () => void;
}
