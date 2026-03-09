import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type Server } from "node:http";
import { Advertiser, Publisher, couponToParam, couponFromParam } from "../src/coupon.js";

describe("Browser E2E: coupon travels through HTTP", () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const advertiser = new Advertiser("acme-plumbing");
  const publisher = new Publisher("news-daily");
  let coupon: ReturnType<typeof advertiser.issueCoupon>;
  let capturedCouponParam: string | null = null;

  beforeAll(async () => {
    coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });
    const adLink = publisher.createAdLink(coupon, "http://localhost:0/convert");

    // Extract just the coupon param for building URLs after we know the port
    const tempUrl = new URL(adLink);
    const couponParam = tempUrl.searchParams.get("coupon")!;

    server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname === "/publisher") {
        // Publisher page with an ad link
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body>
              <h1>News Daily</h1>
              <p>Today's top stories...</p>
              <a id="ad-link" href="http://localhost:${port}/convert?coupon=${couponParam}">
                Acme Plumbing - 10% off!
              </a>
            </body>
          </html>
        `);
      } else if (url.pathname === "/convert") {
        // Advertiser landing page - extracts and verifies coupon
        const param = url.searchParams.get("coupon");
        capturedCouponParam = param;

        let status = "no coupon";
        if (param) {
          try {
            const c = couponFromParam(param);
            const customer = { couponId: c.id, coupon: c, redeemedAt: Date.now() };
            const result = advertiser.verifyRedemption(customer);
            status = result.valid
              ? `verified: channel=${result.channelId}`
              : `rejected: ${result.reason}`;
          } catch {
            status = "invalid coupon data";
          }
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body>
              <h1>Acme Plumbing</h1>
              <p id="status">${status}</p>
              <p id="coupon-present">${param ? "yes" : "no"}</p>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" ? addr!.port : 0;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("customer clicks ad on publisher site, coupon arrives at advertiser site", async () => {
    // 1. Customer visits publisher page
    await page.goto(`http://localhost:${port}/publisher`);
    const headline = await page.textContent("h1");
    expect(headline).toBe("News Daily");

    // 2. Customer sees the ad and clicks it
    const adLink = await page.getAttribute("#ad-link", "href");
    expect(adLink).toContain("coupon=");

    await page.click("#ad-link");
    await page.waitForURL("**/convert**");

    // 3. Coupon arrived at advertiser's landing page
    const couponPresent = await page.textContent("#coupon-present");
    expect(couponPresent).toBe("yes");

    // 4. Advertiser verified the coupon and attributed to channel
    const status = await page.textContent("#status");
    expect(status).toBe("verified: channel=news-daily");
  });

  it("direct visit without coupon shows no attribution", async () => {
    // Customer goes directly to advertiser (no ad click)
    await page.goto(`http://localhost:${port}/convert`);

    const couponPresent = await page.textContent("#coupon-present");
    expect(couponPresent).toBe("no");

    const status = await page.textContent("#status");
    expect(status).toBe("no coupon");
  });

  it("tampered coupon param is rejected in browser flow", async () => {
    // Attacker modifies the coupon in the URL
    const param = couponToParam(coupon);
    const decoded = JSON.parse(Buffer.from(param, "base64url").toString());
    decoded.channelId = "attacker-site";
    const tamperedParam = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    await page.goto(
      `http://localhost:${port}/convert?coupon=${tamperedParam}`
    );

    const status = await page.textContent("#status");
    expect(status).toContain("rejected");
  });

  it("coupon survives URL encoding through the browser", async () => {
    // Visit the publisher page and grab the ad link's coupon param directly
    await page.goto(`http://localhost:${port}/publisher`);
    const adHref = await page.getAttribute("#ad-link", "href");
    const adUrl = new URL(adHref!);
    const param = adUrl.searchParams.get("coupon");

    expect(param).not.toBeNull();

    const decoded = couponFromParam(param!);
    expect(decoded.advertiserId).toBe("acme-plumbing");
    expect(decoded.channelId).toBe("news-daily");
    expect(decoded.payload.offer).toBe("10% off");
  });
});
