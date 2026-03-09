# Cryptographic Coupons

**Sign the UTM.**

In 1887, Coca-Cola printed coupons in newspapers. Customers tore them out, walked to the pharmacy, and redeemed them. Coca-Cola counted which publications drove conversions. Attribution solved.

Digital advertising replaced the coupon with UTM parameters and cookies. Same idea, but unsigned. Anyone can write `?utm_source=nytimes` on a junk site. Extensions like Honey can overwrite attribution at checkout. The transport survived. The anti-forgery didn't.

This repo is a proof-of-concept for **cryptographically signed coupons**: the advertiser signs a coupon, distributes it through a publisher's channel, and the customer carries it to conversion. The advertiser verifies their own signature. No cookies, no device IDs, no cross-domain tracking. A bearer instrument, like the 1887 original, made unforgeable with public-key cryptography.

## What it proves

The test suite maps to specific problems in digital advertising ([Receipts, Please](https://kimjune01.github.io/receipts-please)):

| Problem | What the coupon does |
|---|---|
| **Market for lemons** — MFA sites are indistinguishable from premium | Advertiser sees conversion rate per channel. MFA converts at 0%. |
| **CDO bundling** — Performance Max hides individual channel performance | Advertiser sees every channel individually, even in bundled campaigns. |
| **Honey attack** — middleman overwrites attribution to steal credit | Signature covers the channel ID. Tampering invalidates the coupon. |
| **Privacy** — Google claims hiding placement data protects users | Coupon carries zero user data. It identifies the channel, not the person. |
| **Quality is subjective** — a quality score can't work across advertisers | Each advertiser measures conversion from their own data. Same publisher, different value. |
| **The ratchet** — junk in the baseline can't be removed | Advertiser identifies zero-converting channels and stops issuing coupons to them. |
| **Quality shading** — substituting junk inventory at premium prices | Signature locks the payload. Any modification breaks verification. |

## How it works

```
Advertiser                Publisher               Customer
    |                         |                       |
    |-- signs coupon -------->|                       |
    |   (Ed25519 signature)   |                       |
    |                         |-- distributes ------->|
    |                         |   (in ad creative)    |
    |                         |                       |
    |                         |            claims ----|
    |                         |                       |
    |<------------------------------------- redeems --|
    |   (presents coupon)                             |
    |                                                 |
    |-- verifies signature                            |
    |-- attributes to channel                         |
    |-- counts redemption                             |
```

The coupon is a signed JSON payload containing the advertiser ID, channel ID, and offer. The signature uses Ed25519. Verification uses the advertiser's own public key. No third party needed.

## Run it

```bash
pnpm install
pnpm test        # 14 tests
pnpm run demo    # full flow with attribution report
```

## Prior art and building blocks

The cryptographic primitives have existed for decades. Nobody assembled them for ad attribution.

- [Blind signatures](https://en.wikipedia.org/wiki/Blind_signature) (Chaum, 1983) — bearer tokens with unlinkability
- [Privacy Pass](https://www.rfc-editor.org/rfc/rfc9578.html) (IETF RFC 9578) — standard for anonymous token issuance/redemption
- [Private Click Measurement](https://webkit.org/blog/11940/pcm-click-fraud-prevention-and-attribution-sent-to-advertitor/) (Apple/WebKit) — blind signatures for click attribution
- [Secure E-Coupons](https://link.springer.com/article/10.1023/B:ELEC.0000045976.24984.48) (Blundo et al., 2005) — cryptographic coupon protocols

This is public-key cryptography, not cryptocurrency. No blockchain, no tokens, no gas fees. Just a signed message that proves who issued it.

## Part of

- [The Coupon Was the SDK](https://kimjune01.github.io/coupon-was-the-sdk) — the economics
- [Receipts, Please](https://kimjune01.github.io/receipts-please) — the problem
- [Attested Attribution](https://kimjune01.github.io/attested-attribution) — the protocol
- [Vector Space](https://kimjune01.github.io/vector-space) — the series
