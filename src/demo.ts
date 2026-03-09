import { Advertiser, Publisher, Customer } from "./coupon.js";

console.log("=== Cryptographic Coupon Attribution Demo ===\n");

// 1. Setup
const advertiser = new Advertiser("acme-plumbing");
const publisherA = new Publisher("news-daily");
const publisherB = new Publisher("clickbait-farm");

console.log(`Advertiser: ${advertiser.id}`);
console.log(`Publisher A: ${publisherA.id}`);
console.log(`Publisher B: ${publisherB.id}\n`);

// 2. Issue coupons and create ad links
console.log("--- Issuing coupons as ad links ---");
const linksA: string[] = [];
const linksB: string[] = [];

for (let i = 0; i < 10; i++) {
  const couponA = advertiser.issueCoupon(publisherA.id, { offer: "10% off first visit" });
  const couponB = advertiser.issueCoupon(publisherB.id, { offer: "10% off first visit" });

  linksA.push(publisherA.createAdLink(couponA, "https://acme-plumbing.com/landing"));
  linksB.push(publisherB.createAdLink(couponB, "https://acme-plumbing.com/landing"));
}
console.log(`Created 10 ad links through ${publisherA.id}`);
console.log(`Created 10 ad links through ${publisherB.id}`);
console.log(`Example link: ${linksA[0].slice(0, 80)}...\n`);

// 3. Customers click links and some convert
console.log("--- Customers clicking and converting ---");

// 8 of 10 from news-daily convert (real audience)
for (let i = 0; i < 10; i++) {
  const customer = new Customer();
  const coupon = customer.claimFromUrl(linksA[i]);
  if (i < 8 && coupon) {
    const redemption = customer.redeemCoupon(coupon.id);
    const result = advertiser.verifyRedemption(redemption!);
    if (i === 0) {
      console.log(
        `  ${publisherA.id} customer clicked ad link, redeemed: ${result.valid} (channel: ${result.channelId})`
      );
    }
  }
}
console.log(`  ${publisherA.id}: 8 of 10 customers converted`);

// 1 of 10 from clickbait-farm converts (junk traffic)
for (let i = 0; i < 10; i++) {
  const customer = new Customer();
  const coupon = customer.claimFromUrl(linksB[i]);
  if (i < 1 && coupon) {
    const redemption = customer.redeemCoupon(coupon.id);
    advertiser.verifyRedemption(redemption!);
  }
}
console.log(`  ${publisherB.id}: 1 of 10 customers converted\n`);

// 4. Attribution report
console.log("--- Attribution Report ---");
const report = advertiser.attributionReport();
for (const [channel, stats] of Object.entries(report)) {
  console.log(
    `  ${channel}: ${stats.redeemed}/${stats.issued} redeemed (${(stats.conversionRate * 100).toFixed(0)}% conversion rate)`
  );
}

// 5. Forgery resistance
console.log("\n--- Forgery Attempt ---");
const attacker = new Advertiser("fake-advertiser");
const forgedCoupon = attacker.issueCoupon(publisherA.id, { offer: "free stuff" });
const victim = new Customer();
victim.claimCoupon(forgedCoupon);
const forgedRedemption = victim.redeemCoupon(forgedCoupon.id);
const forgedResult = advertiser.verifyRedemption(forgedRedemption!);
console.log(
  `  Forged coupon accepted? ${forgedResult.valid} (reason: ${forgedResult.reason})`
);

// 6. Double-redemption resistance
console.log("\n--- Double Redemption Attempt ---");
const doubleCoupon = advertiser.issueCoupon(publisherA.id, { offer: "10% off" });
const doubleCustomer = new Customer();
doubleCustomer.claimCoupon(doubleCoupon);
const r1 = doubleCustomer.redeemCoupon(doubleCoupon.id);
const res1 = advertiser.verifyRedemption(r1!);
console.log(`  First redemption: ${res1.valid}`);
const r2 = doubleCustomer.redeemCoupon(doubleCoupon.id);
const res2 = advertiser.verifyRedemption(r2!);
console.log(`  Second redemption: ${res2.valid} (reason: ${res2.reason})`);

// 7. Publisher verification
console.log("\n--- Publisher Verification ---");
const legit = advertiser.issueCoupon(publisherA.id, { offer: "10% off" });
console.log(`  Publisher verifies legitimate coupon: ${publisherA.verifyCoupon(legit)}`);
const tampered = { ...legit, channelId: "stolen" };
console.log(`  Publisher verifies tampered coupon: ${publisherA.verifyCoupon(tampered)}`);

console.log("\n=== Done ===");
