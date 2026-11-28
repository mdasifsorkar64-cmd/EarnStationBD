# Offerwall.GG সংযোগ — EarnStationBD

এই integration **Offerwall.GG-এর signed hosted wall ও conversion postback** ব্যবহার করে। কোনো provider key এই ফাইলে বা browser code-এ রাখা যাবে না।

## Offerwall.GG placement

1. Publisher account তৈরি করে একটি website placement যোগ করুন।
2. Website/domain হিসেবে EarnStationBD-এর অনুমোদিত domain যোগ করুন।
3. Currency name অবশ্যই `BDT` দিন।
4. Units-per-USD / exchange rate আপনার নির্ধারিত BDT rate অনুযায়ী সেট করুন। এটি না বুঝে অনুমান করে সেট করবেন না: এই rate-ই সদস্যের credited BDT amount নির্ধারণ করবে।
5. Postback method `POST` নির্বাচন করুন এবং callback URL দিন:
   `https://earnstationbd.pages.dev/api/offerwall-postback`
6. Placement-এর Public Key ও Secret Key সংগ্রহ করুন। Secret Key কখনো frontend, GitHub বা chat-এ দেবেন না।

## Cloudflare Pages secrets

Cloudflare Pages → earnstationbd → Settings → Variables and Secrets-এ নিচেরগুলো যোগ করতে হবে:

| Name | Type | Value |
|---|---|---|
| `OFFERWALL_PUBLIC_KEY` | Text | Offerwall placement-এর public key |
| `OFFERWALL_SECRET_KEY` | Secret | Offerwall placement-এর private secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase-এর server-side service_role key |

আগে থেকে থাকা `SUPABASE_URL` এবং `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` রাখতে হবে। Service role key কখনো client-side-এ ব্যবহার করা যাবে না।

## নিরাপত্তা ও টাকা হিসাব

- Member wall URL server-side-এ HMAC-signed হয়; browser থেকে পাঠানো user ID বিশ্বাস করা হয় না।
- Postback-এর HMAC-SHA256 signature যাচাই না হলে callback reject হবে।
- `test=1` event কখনো member balance বাড়ায় না।
- `transactionId + status` unique হওয়ায় একই callback retry হলে duplicate credit হবে না।
- Credit callback প্রথমে Pending Commission-এ যায়; Admin যাচাই করে approve করার পর বর্তমান commission split অনুযায়ী ledger-এ যোগ হয়।
- Reversal এলে pending conversion বাতিল হবে; আগে approved হলে member reward-এর সমপরিমাণ debit হবে এবং allocation reversed হবে।
- BDT ledger দুই decimal-এ হিসাব করে; credit ও reversal একইভাবে round হয়।
- Provider callback সফলভাবে সংরক্ষিত না হলে HTTP 2xx পাঠানো হয় না, যাতে Offerwall retry করতে পারে।

## পরীক্ষা

1. Preview-তে test callback পাঠিয়ে signature verification ও event persistence যাচাই করুন।
2. Test callback-এর পর member balance অপরিবর্তিত থাকতে হবে।
3. একই callback দুইবার পাঠিয়ে duplicate event/credit না হওয়া নিশ্চিত করুন।
4. Reversal test-এ approved member reward debit হওয়া যাচাই করুন।
5. সব যাচাই না হওয়া পর্যন্ত Production branch-এ merge করবেন না।


## BD Ads Network (শুধু banner)

BD Ads Network-এর কাছ থেকে শুধু সাধারণ banner ad-এর অনুমোদন এসেছে; rewarded view বা server callback নিশ্চিত হয়নি। তাই banner code পাওয়ার আগে কোনো script embed করা হবে না এবং banner impression/click-এর জন্য সদস্যের balance বাড়ানো হবে না। তাদের publisher dashboard থেকে নির্দিষ্ট banner ad tag পাওয়া গেলে সেটি আলাদা, non-rewarded placement হিসেবে যুক্ত করতে হবে।
