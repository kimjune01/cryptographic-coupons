import { describe, it, expect } from "vitest";
import { Advertiser, Publisher, Customer } from "../src/coupon.js";

describe("Cryptographic Coupon Flow", () => {
  it("full flow: issue → distribute → claim → redeem → attribute", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisherA = new Publisher("news-daily");
    const publisherB = new Publisher("sports-weekly");

    // Advertiser issues coupons for each channel
    const couponA = advertiser.issueCoupon(publisherA.id, {
      offer: "10% off first visit",
    });
    const couponB = advertiser.issueCoupon(publisherB.id, {
      offer: "10% off first visit",
    });

    // Publishers distribute coupons to customers
    const customerA = new Customer();
    const customerB = new Customer();
    customerA.claimCoupon(couponA);
    customerB.claimCoupon(couponB);

    // Customer A converts, Customer B doesn't
    const redemptionA = customerA.redeemCoupon(couponA.id);
    expect(redemptionA).not.toBeNull();

    // Advertiser verifies and attributes
    const attribution = advertiser.verifyRedemption(redemptionA!);
    expect(attribution.valid).toBe(true);
    expect(attribution.channelId).toBe("news-daily");
    expect(attribution.offer).toBe("10% off first visit");
  });

  it("forged coupon fails verification", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const attacker = new Advertiser("fake-advertiser");
    const publisher = new Publisher("news-daily");

    // Attacker forges a coupon pretending to be from the real advertiser
    const forgedCoupon = attacker.issueCoupon(publisher.id, {
      offer: "free stuff",
    });

    const customer = new Customer();
    customer.claimCoupon(forgedCoupon);
    const redemption = customer.redeemCoupon(forgedCoupon.id);

    // Real advertiser rejects the forged coupon
    const attribution = advertiser.verifyRedemption(redemption!);
    expect(attribution.valid).toBe(false);
  });

  it("tampered coupon fails verification", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisher = new Publisher("news-daily");

    const coupon = advertiser.issueCoupon(publisher.id, {
      offer: "10% off",
    });

    // Middleman tampers with the channel to steal attribution
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

    // Same coupon redeemed again
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

    // Customer never claimed it
    const customer = new Customer();
    const redemption = customer.redeemCoupon(coupon.id);
    expect(redemption).toBeNull();
  });

  it("attribution report counts conversions per channel", () => {
    const advertiser = new Advertiser("acme-plumbing");
    const publisherA = new Publisher("news-daily");
    const publisherB = new Publisher("sports-weekly");

    // Issue 5 coupons per channel
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

      // 4 of 5 from channel A convert, 1 of 5 from channel B converts
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
