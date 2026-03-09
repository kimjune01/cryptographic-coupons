import { describe, it, expect } from "vitest";
import { Advertiser, Publisher, Customer } from "../src/coupon.js";

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

// Tests mapped to concerns from "Receipts, Please"
describe("Market for Lemons: MFA vs premium is visible", () => {
  it("advertiser can distinguish MFA from premium through conversion data", () => {
    // "Google knows whether an impression is on the New York Times or an
    // AI-generated listicle farm. The advertiser does not."
    // With coupons, the advertiser DOES know.
    const advertiser = new Advertiser("acme-plumbing");
    const nyt = new Publisher("nytimes.com");
    const mfa = new Publisher("top10-kitchen-gadgets.xyz");

    // Issue 100 coupons through each
    for (let i = 0; i < 100; i++) {
      const couponNYT = advertiser.issueCoupon(nyt.id, { offer: "10% off" });
      const couponMFA = advertiser.issueCoupon(mfa.id, { offer: "10% off" });

      const realCustomer = new Customer();
      const botCustomer = new Customer();
      realCustomer.claimCoupon(couponNYT);
      botCustomer.claimCoupon(couponMFA);

      // NYT readers convert at 8%
      if (i < 8) {
        const r = realCustomer.redeemCoupon(couponNYT.id);
        advertiser.verifyRedemption(r!);
      }
      // MFA bots never convert - unclaimed coupons cost nothing
      // (bots don't redeem because they never reach the advertiser's site)
    }

    const report = advertiser.attributionReport();
    expect(report["nytimes.com"].conversionRate).toBeCloseTo(0.08);
    expect(report["top10-kitchen-gadgets.xyz"].conversionRate).toBe(0);

    // The advertiser can now see which blocks in the Jenga tower are junk
  });
});

describe("CDO Unbundling: Performance Max can't hide channels", () => {
  it("advertiser sees individual channel performance even in a bundled campaign", () => {
    // "Performance Max is a CDO. MFA impressions are the subprime."
    // Coupons let the advertiser unbundle the CDO.
    const advertiser = new Advertiser("acme-plumbing");

    // Simulate Performance Max: 5 channels bundled together
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

    // Advertiser can see every channel individually
    expect(Object.keys(report)).toHaveLength(5);

    // MFA channels have 0% conversion
    expect(report["top10-listicle.xyz"].conversionRate).toBe(0);
    expect(report["ai-slop-farm.net"].conversionRate).toBe(0);

    // Real channels have measurable conversion
    expect(report["youtube.com"].conversionRate).toBeGreaterThan(0);
    expect(report["local-news-site.com"].conversionRate).toBeGreaterThan(0);
  });
});

describe("Honey Attack: middleman can't steal attribution", () => {
  it("overwriting the channel ID invalidates the coupon", () => {
    // PayPal's Honey extension silently overwrites affiliate cookies.
    // A cryptographic coupon can't be rewritten without breaking the signature.
    const advertiser = new Advertiser("acme-plumbing");
    const realPublisher = new Publisher("honest-blog.com");

    const coupon = advertiser.issueCoupon(realPublisher.id, {
      offer: "10% off",
    });

    // Honey-like middleman tries to rewrite attribution to itself
    const hijackedCoupon = { ...coupon, channelId: "honey-affiliate" };

    const customer = new Customer();
    customer.claimCoupon(hijackedCoupon);
    const redemption = customer.redeemCoupon(hijackedCoupon.id);

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(false);
    // The signature covers the channelId - tampering breaks it
  });
});

describe("Privacy: coupon carries no user identity", () => {
  it("coupon contains no PII or device identifier", () => {
    // "Google says it hides placement data to protect user privacy.
    // Hiding which website showed an ad protects no user."
    // The coupon proves this distinction: channel data with zero user data.
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    // The coupon identifies the channel, not the person
    expect(coupon.channelId).toBe("news-daily");
    expect(coupon.advertiserId).toBe("acme-plumbing");

    // No user/device fields exist on the coupon
    const couponKeys = Object.keys(coupon);
    expect(couponKeys).not.toContain("userId");
    expect(couponKeys).not.toContain("deviceId");
    expect(couponKeys).not.toContain("ipAddress");
    expect(couponKeys).not.toContain("email");
    expect(couponKeys).not.toContain("cookie");

    // The coupon is a bearer instrument: whoever holds it can redeem it
    // No identity is bound to the coupon
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

    // Both valid, both attributed to same channel
    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result1.channelId).toBe(result2.channelId);

    // But the advertiser cannot link them to specific people
    // The only data is: channel + offer + valid/invalid
  });
});

describe("Quality Is Subjective: same publisher, different value per buyer", () => {
  it("same publisher converts differently for different advertisers", () => {
    // "A niche app with 50,000 loyal users converts at 8% for a SaaS
    // advertiser and 0.02% for a mobile game. Quality depends on who
    // is buying. It cannot be scored in advance."
    const saasCompany = new Advertiser("devtools-saas");
    const mobileGame = new Advertiser("candy-crush-clone");
    const publisher = new Publisher("hacker-news");

    // Same publisher, same audience
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

      // HN readers sign up for dev tools at 8%
      if (i < 8) {
        const r = devCustomer.redeemCoupon(couponSaas.id);
        saasCompany.verifyRedemption(r!);
      }
      // HN readers don't play mobile games - 0% conversion
    }

    const saasReport = saasCompany.attributionReport();
    const gameReport = mobileGame.attributionReport();

    expect(saasReport["hacker-news"].conversionRate).toBeCloseTo(0.08);
    expect(gameReport["hacker-news"].conversionRate).toBe(0);

    // No universal quality score could have predicted this.
    // Each advertiser measures quality from their own conversions.
  });
});

describe("Breaking the Ratchet: advertiser can identify and drop junk", () => {
  it("advertiser stops issuing coupons to zero-converting channels", () => {
    // "The racket is a ratchet. Once junk is in the revenue baseline,
    // removing it means missing the quarter."
    // The advertiser breaks the ratchet by seeing the data.
    const advertiser = new Advertiser("acme-plumbing");
    const good = new Publisher("local-news.com");
    const junk = new Publisher("ai-slop-farm.net");

    // Phase 1: issue to both channels
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
      // junk channel: zero conversions
    }

    const report1 = advertiser.attributionReport();
    expect(report1["local-news.com"].conversionRate).toBeCloseTo(0.1);
    expect(report1["ai-slop-farm.net"].conversionRate).toBe(0);

    // Phase 2: advertiser sees the data and stops funding junk.
    // Only issues coupons to channels that convert.
    const convertingChannels = Object.entries(report1)
      .filter(([, stats]) => stats.conversionRate > 0)
      .map(([channelId]) => channelId);

    expect(convertingChannels).toContain("local-news.com");
    expect(convertingChannels).not.toContain("ai-slop-farm.net");

    // The ratchet is broken. The advertiser pulled the junk block
    // out of the Jenga tower because they could finally see it.
  });
});

describe("Quality Shading: can't substitute cheaper inventory", () => {
  it("publisher can't relabel junk impressions as premium", () => {
    // "Hershey's replaced the chocolate in Reese's cups with 'chocolate candy.'
    // Same wrapper, cheaper filling. Carl Shapiro called this quality shading."
    // The coupon's signature locks the channel identity.
    const advertiser = new Advertiser("acme-plumbing");
    const premium = new Publisher("nytimes.com");

    const coupon = advertiser.issueCoupon(premium.id, { offer: "10% off" });

    // An exchange tries to serve this coupon on a junk site instead,
    // relabeling the channel to hide the substitution
    const shadedCoupon = { ...coupon, channelId: "nytimes.com" };
    // Even keeping the same channelId, any other field change breaks it
    const shadedPayload = {
      ...coupon,
      payload: { offer: "10% off", source: "actually-junk-site.xyz" },
    };

    const customer = new Customer();
    customer.claimCoupon(shadedPayload);
    const redemption = customer.redeemCoupon(shadedPayload.id);

    const result = advertiser.verifyRedemption(redemption!);
    expect(result.valid).toBe(false);
    // The signature covers the entire payload - any modification invalidates it
  });
});
