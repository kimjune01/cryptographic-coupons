import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
  createPublicKey,
  type KeyObject,
} from "node:crypto";

export interface CouponPayload {
  offer: string;
  [key: string]: unknown;
}

export interface CouponData {
  id: string;
  advertiserId: string;
  channelId: string;
  payload: CouponPayload;
  issuedAt: number;
  expiresAt: number;
}

export interface Coupon extends CouponData {
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

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class Advertiser {
  readonly id: string;
  private privateKey: KeyObject;
  private publicKey: KeyObject;
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

  getPublicKeyPem(): string {
    return this.publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  issueCoupon(
    channelId: string,
    payload: CouponPayload,
    ttlMs: number = DEFAULT_TTL_MS
  ): Coupon {
    const now = Date.now();
    const id = createHash("sha256")
      .update(`${this.id}:${channelId}:${now}:${Math.random()}`)
      .digest("hex");

    const data: CouponData = {
      id,
      advertiserId: this.id,
      channelId,
      payload,
      issuedAt: now,
      expiresAt: now + ttlMs,
    };

    const message = serializeCouponData(data);
    const signature = sign(null, Buffer.from(message), this.privateKey).toString(
      "base64"
    );

    const stats = this.channelStats.get(channelId) ?? {
      issued: 0,
      redeemed: 0,
    };
    stats.issued++;
    this.channelStats.set(channelId, stats);

    return {
      ...data,
      signature,
      publicKey: this.getPublicKeyPem(),
    };
  }

  verifyRedemption(redemption: Redemption): Attribution {
    const { coupon } = redemption;

    if (this.redeemedCoupons.has(coupon.id)) {
      return { valid: false, reason: "already redeemed" };
    }

    if (redemption.redeemedAt > coupon.expiresAt) {
      return { valid: false, reason: "expired" };
    }

    const data: CouponData = {
      id: coupon.id,
      advertiserId: coupon.advertiserId,
      channelId: coupon.channelId,
      payload: coupon.payload,
      issuedAt: coupon.issuedAt,
      expiresAt: coupon.expiresAt,
    };

    const message = serializeCouponData(data);
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
}

export class Publisher {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  /** Publisher verifies the coupon is real before distributing it */
  verifyCoupon(coupon: Coupon): boolean {
    const data: CouponData = {
      id: coupon.id,
      advertiserId: coupon.advertiserId,
      channelId: coupon.channelId,
      payload: coupon.payload,
      issuedAt: coupon.issuedAt,
      expiresAt: coupon.expiresAt,
    };
    const message = serializeCouponData(data);
    const pubKey = createPublicKey(coupon.publicKey);
    return verify(
      null,
      Buffer.from(message),
      pubKey,
      Buffer.from(coupon.signature, "base64")
    );
  }

  /** Publisher embeds the coupon in an ad link URL */
  createAdLink(coupon: Coupon, landingUrl: string): string {
    const encoded = couponToParam(coupon);
    const url = new URL(landingUrl);
    url.searchParams.set("coupon", encoded);
    return url.toString();
  }
}

export class Customer {
  private coupons: Map<string, Coupon> = new Map();

  claimCoupon(coupon: Coupon): void {
    this.coupons.set(coupon.id, coupon);
  }

  /** Claim a coupon from a URL (extracts from query param) */
  claimFromUrl(url: string): Coupon | null {
    const coupon = couponFromUrl(url);
    if (coupon) {
      this.coupons.set(coupon.id, coupon);
    }
    return coupon;
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

// --- URL Transport ---

/** Encode a coupon as a URL-safe base64 string */
export function couponToParam(coupon: Coupon): string {
  const json = JSON.stringify(coupon);
  return Buffer.from(json).toString("base64url");
}

/** Decode a coupon from a URL-safe base64 string */
export function couponFromParam(param: string): Coupon {
  const json = Buffer.from(param, "base64url").toString("utf-8");
  return JSON.parse(json) as Coupon;
}

/** Extract a coupon from a URL's ?coupon= query parameter */
export function couponFromUrl(urlStr: string): Coupon | null {
  const url = new URL(urlStr);
  const param = url.searchParams.get("coupon");
  if (!param) return null;
  return couponFromParam(param);
}

/** Serialize coupon data for signing/verification (deterministic) */
function serializeCouponData(data: CouponData): string {
  return JSON.stringify({
    id: data.id,
    advertiserId: data.advertiserId,
    channelId: data.channelId,
    payload: data.payload,
    issuedAt: data.issuedAt,
    expiresAt: data.expiresAt,
  });
}
