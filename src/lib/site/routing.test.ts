import { describe, expect, it } from "vitest";
import { decideRoute, isSiteHost, normalizeHost, type SiteConfig } from "./routing";

const prod: SiteConfig = { siteDomain: "needl-booker.de", appDomain: "app.needl-booker.de" };
const route = (host: string, pathname: string, search = "", config: SiteConfig = prod) =>
  decideRoute({ host, pathname, search }, config);

describe("host detection", () => {
  it("recognises the website domain and www, case- and port-insensitive", () => {
    expect(isSiteHost("needl-booker.de", prod)).toBe(true);
    expect(isSiteHost("WWW.Needl-Booker.de:443", prod)).toBe(true);
    expect(isSiteHost("app.needl-booker.de", prod)).toBe(false);
    expect(isSiteHost("evil-needl-booker.de", prod)).toBe(false);
    expect(isSiteHost("needl-booker.de.evil.com", prod)).toBe(false);
  });

  it("never treats a host as website when SITE_DOMAIN is unset", () => {
    expect(isSiteHost("needl-booker.de", { appDomain: "app.needl-booker.de" })).toBe(false);
    expect(isSiteHost("", {})).toBe(false);
  });

  it("accepts SITE_DOMAIN with scheme or trailing slash", () => {
    expect(isSiteHost("needl-booker.de", { siteDomain: "https://needl-booker.de/" })).toBe(true);
  });

  it("normalises hosts", () => {
    expect(normalizeHost(" Needl-Booker.DE.:8080 ")).toBe("needl-booker.de");
    expect(normalizeHost(null)).toBe("");
  });
});

describe("website domain", () => {
  it("shows the start page at /", () => {
    expect(route("needl-booker.de", "/")).toEqual({ kind: "rewrite", path: "/start" });
    expect(route("www.needl-booker.de", "/")).toEqual({ kind: "rewrite", path: "/start" });
  });

  it("serves legal pages and crawler files", () => {
    for (const p of ["/impressum", "/datenschutz", "/nutzungsbedingungen", "/datenloeschung"])
      expect(route("needl-booker.de", p)).toEqual({ kind: "next" });
    expect(route("needl-booker.de", "/robots.txt")).toEqual({ kind: "next" });
    expect(route("needl-booker.de", "/sitemap.xml")).toEqual({ kind: "next" });
  });

  it("redirects the internal start path to /", () => {
    expect(route("needl-booker.de", "/start", "?a=1")).toEqual({
      kind: "redirect",
      url: "/?a=1",
      permanent: true,
    });
  });

  it("sends app pages to the app domain, keeping path and query", () => {
    expect(route("needl-booker.de", "/leads", "?q=x")).toEqual({
      kind: "redirect",
      url: "https://app.needl-booker.de/leads?q=x",
      permanent: false,
    });
    expect(route("needl-booker.de", "/login")).toMatchObject({
      url: "https://app.needl-booker.de/login",
    });
  });

  it("does not match lookalike paths as legal pages", () => {
    expect(route("needl-booker.de", "/impressum-alt")).toMatchObject({ kind: "redirect" });
  });

  it("never serves the API", () => {
    expect(route("needl-booker.de", "/api/webhooks/meta")).toEqual({ kind: "not-found" });
    expect(route("needl-booker.de", "/api")).toEqual({ kind: "not-found" });
  });

  it("answers 404 for app paths when APP_DOMAIN is unset", () => {
    expect(route("needl-booker.de", "/leads", "", { siteDomain: "needl-booker.de" })).toEqual({
      kind: "not-found",
    });
  });
});

describe("app domain", () => {
  it("keeps the app (login required) at / and app routes", () => {
    expect(route("app.needl-booker.de", "/")).toEqual({ kind: "auth" });
    expect(route("app.needl-booker.de", "/leads")).toEqual({ kind: "auth" });
    expect(route("app.needl-booker.de", "/api/attachments/x")).toEqual({ kind: "auth" });
  });

  it("serves legal pages without login", () => {
    expect(route("app.needl-booker.de", "/datenschutz")).toEqual({ kind: "next" });
    expect(route("app.needl-booker.de", "/impressum")).toEqual({ kind: "next" });
  });

  it("keeps the public app paths public", () => {
    expect(route("app.needl-booker.de", "/login")).toEqual({ kind: "next" });
    expect(route("app.needl-booker.de", "/api/webhooks/meta")).toEqual({ kind: "next" });
  });

  it("sends the website start page to the website domain", () => {
    expect(route("app.needl-booker.de", "/start")).toEqual({
      kind: "redirect",
      url: "https://needl-booker.de/",
      permanent: false,
    });
  });

  it("without SITE_DOMAIN (development) behaves like before and shows /start locally", () => {
    const dev = { appDomain: "" };
    expect(route("localhost:3000", "/", "", dev)).toEqual({ kind: "auth" });
    expect(route("localhost:3000", "/start", "", dev)).toEqual({ kind: "next" });
    expect(route("localhost:3000", "/impressum", "", dev)).toEqual({ kind: "next" });
  });
});
