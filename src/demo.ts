import { Advertiser, Publisher, Customer } from "./coupon.js";

console.log("=== Cryptographic Coupon Attribution Demo ===\n");

// 1. Setup
const advertiser = new Advertiser("acme-plumbing");
const publisherA = new Publisher("news-daily");
const publisherB = new Publisher("clickbait-farm");

console.log(`Advertiser: ${advertiser.id}`);
console.log(`Publisher A: ${publisherA.id}`);
console.log(`Publisher B: ${publisherB.id}\n`);

// 2. Issue coupons through both channels
console.log("--- Issuing coupons ---");
const couponsA: ReturnType<typeof advertiser.issueCoupon>[] = [];
const couponsB: ReturnType<typeof advertiser.issueCoupon>[] = [];

for (let i = 0; i < 10; i++) {
  couponsA.push(
    advertiser.issueCoupon(publisherA.id, { offer: "10% off first visit" })
  );
  couponsB.push(
    advertiser.issueCoupon(publisherB.id, { offer: "10% off first visit" })
  );
}
console.log(`Issued 10 coupons through ${publisherA.id}`);
console.log(`Issued 10 coupons through ${publisherB.id}\n`);

// 3. Customers claim and some redeem
console.log("--- Customers claiming and converting ---");

// 8 of 10 from news-daily convert (real audience)
for (let i = 0; i < 10; i++) {
  const customer = new Customer();
  customer.claimCoupon(couponsA[i]);
  if (i < 8) {
    const redemption = customer.redeemCoupon(couponsA[i].id);
    const result = advertiser.verifyRedemption(redemption!);
    if (i === 0) {
      console.log(
        `  ${publisherA.id} customer redeemed: ${result.valid} (channel: ${result.channelId})`
      );
    }
  }
}
console.log(`  ${publisherA.id}: 8 of 10 customers converted`);

// 1 of 10 from clickbait-farm converts (junk traffic)
for (let i = 0; i < 10; i++) {
  const customer = new Customer();
  customer.claimCoupon(couponsB[i]);
  if (i < 1) {
    const redemption = customer.redeemCoupon(couponsB[i].id);
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

// 5. Demonstrate forgery resistance
console.log("\n--- Forgery Attempt ---");
const attacker = new Advertiser("fake-advertiser");
const forgedCoupon = attacker.issueCoupon(publisherA.id, {
  offer: "free stuff",
});
const victim = new Customer();
victim.claimCoupon(forgedCoupon);
const forgedRedemption = victim.redeemCoupon(forgedCoupon.id);
const forgedResult = advertiser.verifyRedemption(forgedRedemption!);
console.log(
  `  Forged coupon accepted? ${forgedResult.valid} (reason: ${forgedResult.reason})`
);

// 6. Demonstrate double-redemption resistance
console.log("\n--- Double Redemption Attempt ---");
const doubleCoupon = advertiser.issueCoupon(publisherA.id, {
  offer: "10% off",
});
const doubleCustomer = new Customer();
doubleCustomer.claimCoupon(doubleCoupon);
const r1 = doubleCustomer.redeemCoupon(doubleCoupon.id);
const res1 = advertiser.verifyRedemption(r1!);
console.log(`  First redemption: ${res1.valid}`);
const r2 = doubleCustomer.redeemCoupon(doubleCoupon.id);
const res2 = advertiser.verifyRedemption(r2!);
console.log(
  `  Second redemption: ${res2.valid} (reason: ${res2.reason})`
);

console.log("\n=== Done ===");
