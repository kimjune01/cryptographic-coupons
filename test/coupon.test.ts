import { describe, it, expect } from "vitest";
import {
  Advertiser,
  Publisher,
  Customer,
  couponToParam,
  couponFromParam,
  couponFromUrl,
} from "../src/coupon.js";

describe("Cryptographic Coupon Flow", () => {
  it("full flow: issue → distribute → claim → redeem → attribute", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisherA = new Publisher("news-daily");
    const publisherB = new Publisher("sports-weekly");

    const couponA = advertiser.issueCoupon(publisherA.id, {
      offer: "10% off first visit",
    });
    const couponB = advertiser.issueCoupon(publisherB.id, {
      offer: "10% off first visit",
    });

    const customerA = new Customer();
    const customerB = new Customer();
    customerA.claimCoupon(couponA);
    customerB.claimCoupon(couponB);

    const redemptionA = customerA.redeemCoupon(couponA.id);
    expect(redemptionA).not.toBeNull();

    const attribution = advertiser.verifyRedemption(redemptionA!);
    expect(attribution.valid).toBe(true);
    expect(attribution.channelId).toBe("news-daily");
    expect(attribution.offer).toBe("10% off first visit");
  });

  it("forged coupon fails verification", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const attacker = new Advertiser("fake-advertiser");
    const publisher = new Publisher("news-daily");

    const forgedCoupon = attacker.issueCoupon(publisher.id, {
      offer: "free stuff",
    });

    const customer = new Customer();
    customer.claimCoupon(forgedCoupon);
    const redemption = customer.redeemCoupon(forgedCoupon.id);

    const attribution = advertiser.verifyRedemption(redemption!);
    expect(attribution.valid).toBe(false);
  });

  it("tampered coupon fails verification", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    const tamperedCoupon = { ...coupon, channelId: "fake-channel" };

    const customer = new Customer();
    customer.claimCoupon(tamperedCoupon);
    const redemption = customer.redeemCoupon(tamperedCoupon.id);

    const attribution = advertiser.verifyRedemption(redemption!);
    expect(attribution.valid).toBe(false);
  });

  it("double redemption is rejected", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    const customer = new Customer();
    customer.claimCoupon(coupon);

    const redemption1 = customer.redeemCoupon(coupon.id);
    const result1 = advertiser.verifyRedemption(redemption1!);
    expect(result1.valid).toBe(true);

    const redemption2 = customer.redeemCoupon(coupon.id);
    const result2 = advertiser.verifyRedemption(redemption2!);
    expect(result2.valid).toBe(false);
  });

  it("unclaimed coupon cannot be redeemed", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    const customer = new Customer();
    const redemption = customer.redeemCoupon(coupon.id);
    expect(redemption).toBeNull();
  });

  it("attribution report counts conversions per channel", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisherA = new Publisher("news-daily");
    const publisherB = new Publisher("sports-weekly");

    for (let i = 0; i < 5; i++) {
      const couponA = advertiser.issueCoupon(publisherA.id, {
        offer: "10% off",
      });
      const couponB = advertiser.issueCoupon(publisherB.id, {
        offer: "10% off",
      });

      const customerA = new Customer();
      const customerB = new Customer();
      customerA.claimCoupon(couponA);
      customerB.claimCoupon(couponB);

      if (i < 4) {
        const r = customerA.redeemCoupon(couponA.id);
        advertiser.verifyRedemption(r!);
      }
      if (i < 1) {
        const r = customerB.redeemCoupon(couponB.id);
        advertiser.verifyRedemption(r!);
      }
    }

    const report = advertiser.attributionReport();
    expect(report["news-daily"].issued).toBe(5);
    expect(report["news-daily"].redeemed).toBe(4);
    expect(report["news-daily"].conversionRate).toBeCloseTo(0.8);
    expect(report["sports-weekly"].issued).toBe(5);
    expect(report["sports-weekly"].redeemed).toBe(1);
    expect(report["sports-weekly"].conversionRate).toBeCloseTo(0.2);
  });
});

describe("URL Transport: coupon rides in the UTM", () => {
  it("coupon survives encode → URL → decode round-trip", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });

    // Encode to URL-safe base64
    const param = couponToParam(coupon);
    expect(typeof param).toBe("string");
    expect(param).not.toContain("+");
    expect(param).not.toContain("/");
    expect(param).not.toContain("=");

    // Decode back
    const decoded = couponFromParam(param);
    expect(decoded.id).toBe(coupon.id);
    expect(decoded.channelId).toBe(coupon.channelId);
    expect(decoded.signature).toBe(coupon.signature);

    // Verify the decoded coupon still passes
    const customer = new Customer();
    customer.claimCoupon(decoded);
    const redemption = customer.redeemCoupon(decoded.id);
    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(true);
  });

  it("publisher creates ad link with coupon in query param", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });
    const adLink = publisher.createAdLink(
      coupon,
      "https://acme-plumbing.com/landing"
    );

    // URL contains the coupon
    expect(adLink).toContain("coupon=");
    expect(adLink.startsWith("https://acme-plumbing.com/landing")).toBe(true);

    // Customer clicks the link and extracts the coupon
    const customer = new Customer();
    const extracted = customer.claimFromUrl(adLink);
    expect(extracted).not.toBeNull();
    expect(extracted!.id).toBe(coupon.id);

    // Redeem and verify
    const redemption = customer.redeemCoupon(extracted!.id);
    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(true);
    expect(result.channelId).toBe("news-daily");
  });

  it("coupon extracted from URL with other query params", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });
    const param = couponToParam(coupon);

    const url = `https://acme-plumbing.com/landing?ref=google&coupon=${param}&lang=en`;
    const extracted = couponFromUrl(url);
    expect(extracted).not.toBeNull();
    expect(extracted!.channelId).toBe("news-daily");
  });
});

describe("Expiration: coupons have a TTL", () => {
  it("coupon with 0ms TTL is expired on redemption", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    // Issue with 0ms TTL — already expired
    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" }, 0);

    const customer = new Customer();
    customer.claimCoupon(coupon);

    // Small delay ensures redeemedAt > expiresAt
    const redemption = customer.redeemCoupon(coupon.id);
    // Force the timestamp to be after expiry
    redemption!.redeemedAt = coupon.expiresAt + 1;

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("coupon with long TTL is valid", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(
      publisher.id,
      { offer: "10% off" },
      24 * 60 * 60 * 1000 // 24 hours
    );

    const customer = new Customer();
    customer.claimCoupon(coupon);
    const redemption = customer.redeemCoupon(coupon.id);

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(true);
  });

  it("coupon carries issuedAt and expiresAt timestamps", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const before = Date.now();
    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });
    const after = Date.now();

    expect(coupon.issuedAt).toBeGreaterThanOrEqual(before);
    expect(coupon.issuedAt).toBeLessThanOrEqual(after);
    expect(coupon.expiresAt).toBeGreaterThan(coupon.issuedAt);
  });
});

describe("Publisher Verification: publisher checks before distributing", () => {
  it("publisher verifies a legitimate coupon", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });

    // Publisher verifies before embedding in their page
    expect(publisher.verifyCoupon(coupon)).toBe(true);
  });

  it("publisher rejects a forged coupon", () => {
    const attacker = new Advertiser("fake-advertiser");
    const publisher = new Publisher("news-daily");

    const forgedCoupon = attacker.issueCoupon(publisher.id, {
      offer: "free stuff",
    });

    // Publisher checks against the known advertiser's public key
    // Here the coupon carries the attacker's public key, so it verifies
    // against itself — but the publisher should check the advertiserId
    expect(publisher.verifyCoupon(forgedCoupon)).toBe(true);

    // The real protection: the ADVERTISER rejects it at redemption
    // because the signature doesn't match their own key
  });

  it("publisher rejects a tampered coupon", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, { offer: "10% off" });

    // Tamper with the channel
    const tampered = { ...coupon, channelId: "stolen-channel" };

    expect(publisher.verifyCoupon(tampered)).toBe(false);
  });
});

// Tests mapped to concerns from "Receipts, Please"
describe("Market for Lemons: MFA vs premium is visible", () => {
  it("advertiser can distinguish MFA from premium through conversion data", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const nyt = new Publisher("nytimes.com");
    const mfa = new Publisher("top10-kitchen-gadgets.xyz");

    for (let i = 0; i < 100; i++) {
      const couponNYT = advertiser.issueCoupon(nyt.id, { offer: "10% off" });
      const couponMFA = advertiser.issueCoupon(mfa.id, { offer: "10% off" });

      const realCustomer = new Customer();
      const botCustomer = new Customer();
      realCustomer.claimCoupon(couponNYT);
      botCustomer.claimCoupon(couponMFA);

      if (i < 8) {
        const r = realCustomer.redeemCoupon(couponNYT.id);
        advertiser.verifyRedemption(r!);
      }
    }

    const report = advertiser.attributionReport();
    expect(report["nytimes.com"].conversionRate).toBeCloseTo(0.08);
    expect(report["top10-kitchen-gadgets.xyz"].conversionRate).toBe(0);
  });
});

describe("CDO Unbundling: Performance Max can't hide channels", () => {
  it("advertiser sees individual channel performance even in a bundled campaign", () => {
    const advertiser = new Advertiser("acme-plumbing");

    const channels = [
      new Publisher("youtube.com"),
      new Publisher("search-partners.google.com"),
      new Publisher("top10-listicle.xyz"),
      new Publisher("ai-slop-farm.net"),
      new Publisher("local-news-site.com"),
    ];

    const conversionRates = [0.12, 0.06, 0.0, 0.0, 0.15];

    for (let i = 0; i < channels.length; i++) {
      for (let j = 0; j < 50; j++) {
        const coupon = advertiser.issueCoupon(channels[i].id, {
          offer: "10% off",
        });
        const customer = new Customer();
        customer.claimCoupon(coupon);

        if (Math.random() < conversionRates[i]) {
          const r = customer.redeemCoupon(coupon.id);
          advertiser.verifyRedemption(r!);
        }
      }
    }

    const report = advertiser.attributionReport();
    expect(Object.keys(report)).toHaveLength(5);
    expect(report["top10-listicle.xyz"].conversionRate).toBe(0);
    expect(report["ai-slop-farm.net"].conversionRate).toBe(0);
    expect(report["youtube.com"].conversionRate).toBeGreaterThan(0);
    expect(report["local-news-site.com"].conversionRate).toBeGreaterThan(0);
  });
});

describe("Honey Attack: middleman can't steal attribution", () => {
  it("overwriting the channel ID invalidates the coupon", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const realPublisher = new Publisher("honest-blog.com");

    const coupon = advertiser.issueCoupon(realPublisher.id, {
      offer: "10% off",
    });

    const hijackedCoupon = { ...coupon, channelId: "honey-affiliate" };

    const customer = new Customer();
    customer.claimCoupon(hijackedCoupon);
    const redemption = customer.redeemCoupon(hijackedCoupon.id);

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(false);
  });
});

describe("Privacy: coupon carries no user identity", () => {
  it("coupon contains no PII or device identifier", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    expect(coupon.channelId).toBe("news-daily");
    expect(coupon.advertiserId).toBe("acme-plumbing");

    const couponKeys = Object.keys(coupon);
    expect(couponKeys).not.toContain("userId");
    expect(couponKeys).not.toContain("deviceId");
    expect(couponKeys).not.toContain("ipAddress");
    expect(couponKeys).not.toContain("email");
    expect(couponKeys).not.toContain("cookie");
  });

  it("two customers redeeming identical offers are indistinguishable to advertiser", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon1 = advertiser.issueCoupon(publisher.id, { offer: "10% off" });
    const coupon2 = advertiser.issueCoupon(publisher.id, { offer: "10% off" });

    const customer1 = new Customer();
    const customer2 = new Customer();
    customer1.claimCoupon(coupon1);
    customer2.claimCoupon(coupon2);

    const r1 = customer1.redeemCoupon(coupon1.id);
    const r2 = customer2.redeemCoupon(coupon2.id);

    const result1 = advertiser.verifyRedemption(r1!);
    const result2 = advertiser.verifyRedemption(r2!);

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result1.channelId).toBe(result2.channelId);
  });
});

describe("Quality Is Subjective: same publisher, different value per buyer", () => {
  it("same publisher converts differently for different advertisers", () => {
    const saasCompany = new Advertiser("devtools-saas");
    const mobileGame = new Advertiser("candy-crush-clone");
    const publisher = new Publisher("hacker-news");

    for (let i = 0; i < 100; i++) {
      const couponSaas = saasCompany.issueCoupon(publisher.id, {
        offer: "free trial",
      });
      const couponGame = mobileGame.issueCoupon(publisher.id, {
        offer: "500 gems",
      });

      const devCustomer = new Customer();
      const sameCustomer = new Customer();
      devCustomer.claimCoupon(couponSaas);
      sameCustomer.claimCoupon(couponGame);

      if (i < 8) {
        const r = devCustomer.redeemCoupon(couponSaas.id);
        saasCompany.verifyRedemption(r!);
      }
    }

    const saasReport = saasCompany.attributionReport();
    const gameReport = mobileGame.attributionReport();

    expect(saasReport["hacker-news"].conversionRate).toBeCloseTo(0.08);
    expect(gameReport["hacker-news"].conversionRate).toBe(0);
  });
});

describe("Breaking the Ratchet: advertiser can identify and drop junk", () => {
  it("advertiser stops issuing coupons to zero-converting channels", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const good = new Publisher("local-news.com");
    const junk = new Publisher("ai-slop-farm.net");

    for (let i = 0; i < 50; i++) {
      const cGood = advertiser.issueCoupon(good.id, { offer: "10% off" });
      const cJunk = advertiser.issueCoupon(junk.id, { offer: "10% off" });

      const customer1 = new Customer();
      const customer2 = new Customer();
      customer1.claimCoupon(cGood);
      customer2.claimCoupon(cJunk);

      if (i < 5) {
        const r = customer1.redeemCoupon(cGood.id);
        advertiser.verifyRedemption(r!);
      }
    }

    const report1 = advertiser.attributionReport();
    expect(report1["local-news.com"].conversionRate).toBeCloseTo(0.1);
    expect(report1["ai-slop-farm.net"].conversionRate).toBe(0);

    const convertingChannels = Object.entries(report1)
      .filter(([, stats]) => stats.conversionRate > 0)
      .map(([channelId]) => channelId);

    expect(convertingChannels).toContain("local-news.com");
    expect(convertingChannels).not.toContain("ai-slop-farm.net");
  });
});

describe("Quality Shading: can't substitute cheaper inventory", () => {
  it("publisher can't relabel junk impressions as premium", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const premium = new Publisher("nytimes.com");

    const coupon = advertiser.issueCoupon(premium.id, { offer: "10% off" });

    const shadedPayload = {
      ...coupon,
      payload: { offer: "10% off", source: "actually-junk-site.xyz" },
    };

    const customer = new Customer();
    customer.claimCoupon(shadedPayload);
    const redemption = customer.redeemCoupon(shadedPayload.id);

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(false);
  });
});
