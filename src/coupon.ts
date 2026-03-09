import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
  type KeyObject,
} from "node:crypto";

export interface CouponPayload {
  offer: string;
  [key: string]: unknown;
}

export interface Coupon {
  id: string;
  advertiserId: string;
  channelId: string;
  payload: CouponPayload;
  signature: string;
  publicKey: string;
}

export interface Redemption {
  couponId: string;
  coupon: Coupon;
  redeemedAt: number;
}

export interface Attribution {
  valid: boolean;
  channelId?: string;
  offer?: string;
  reason?: string;
}

export interface ChannelReport {
  issued: number;
  redeemed: number;
  conversionRate: number;
}

export class Advertiser {
  readonly id: string;
  private privateKey: KeyObject;
  private publicKey: KeyObject;
  private issuedCoupons: Map<string, { channelId: string }> = new Map();
  private redeemedCoupons: Set<string> = new Set();
  private channelStats: Map<
    string,
    { issued: number; redeemed: number }
  > = new Map();

  constructor(id: string) {
    this.id = id;
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  issueCoupon(channelId: string, payload: CouponPayload): Coupon {
    const id = createHash("sha256")
      .update(`${this.id}:${channelId}:${Date.now()}:${Math.random()}`)
      .digest("hex");

    const message = this.serializeCouponData(id, this.id, channelId, payload);
    const signature = sign(null, Buffer.from(message), this.privateKey).toString(
      "base64"
    );

    this.issuedCoupons.set(id, { channelId });

    const stats = this.channelStats.get(channelId) ?? {
      issued: 0,
      redeemed: 0,
    };
    stats.issued++;
    this.channelStats.set(channelId, stats);

    return {
      id,
      advertiserId: this.id,
      channelId,
      payload,
      signature,
      publicKey: this.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    };
  }

  verifyRedemption(redemption: Redemption): Attribution {
    const { coupon } = redemption;

    // Check double redemption
    if (this.redeemedCoupons.has(coupon.id)) {
      return { valid: false, reason: "already redeemed" };
    }

    // Verify the signature using our own public key
    const message = this.serializeCouponData(
      coupon.id,
      coupon.advertiserId,
      coupon.channelId,
      coupon.payload
    );

    const valid = verify(
      null,
      Buffer.from(message),
      this.publicKey,
      Buffer.from(coupon.signature, "base64")
    );

    if (!valid) {
      return { valid: false, reason: "invalid signature" };
    }

    this.redeemedCoupons.add(coupon.id);

    const stats = this.channelStats.get(coupon.channelId);
    if (stats) {
      stats.redeemed++;
    }

    return {
      valid: true,
      channelId: coupon.channelId,
      offer: coupon.payload.offer,
    };
  }

  attributionReport(): Record<string, ChannelReport> {
    const report: Record<string, ChannelReport> = {};
    for (const [channelId, stats] of this.channelStats) {
      report[channelId] = {
        issued: stats.issued,
        redeemed: stats.redeemed,
        conversionRate: stats.issued > 0 ? stats.redeemed / stats.issued : 0,
      };
    }
    return report;
  }

  private serializeCouponData(
    id: string,
    advertiserId: string,
    channelId: string,
    payload: CouponPayload
  ): string {
    return JSON.stringify({ id, advertiserId, channelId, payload });
  }
}

export class Publisher {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}

export class Customer {
  private coupons: Map<string, Coupon> = new Map();

  claimCoupon(coupon: Coupon): void {
    this.coupons.set(coupon.id, coupon);
  }

  redeemCoupon(couponId: string): Redemption | null {
    const coupon = this.coupons.get(couponId);
    if (!coupon) return null;

    return {
      couponId: coupon.id,
      coupon,
      redeemedAt: Date.now(),
    };
  }
}
