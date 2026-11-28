(() => {
  "use strict";
  const rules = [
    [/invalid login credentials|invalid_credentials|email or password/i, "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আবার যাচাই করুন।"],
    [/email not confirmed|email_not_confirmed/i, "আপনার ইমেইল এখনো যাচাই করা হয়নি। ইমেইলের যাচাইকরণ লিংকে চাপ দিন।"],
    [/user already registered|already registered|duplicate key.*email/i, "এই ইমেইল দিয়ে আগে থেকেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।"],
    [/phone.*(already|duplicate)|profiles_phone_key/i, "এই মোবাইল নম্বরটি আগে থেকেই ব্যবহার করা হয়েছে। অন্য নম্বর দিন."],
    [/invalid email|email.*(invalid|malformed)|unable to validate email/i, "ইমেইল ঠিকানাটি সঠিক নয়। আবার লিখুন।"],
    [/user not found|no user found|account.*not found/i, "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। ইমেইল ঠিক আছে কি না দেখুন।"],
    [/insufficient.*(balance|fund)|not enough.*(balance|fund)/i, "আপনার ব্যালেন্স এই কাজের জন্য পর্যাপ্ত নয়।"],
    [/daily.*limit|limit.*reached|maximum.*(daily|per day)/i, "আজকের নির্ধারিত সীমা পূর্ণ হয়েছে। আগামীকাল আবার চেষ্টা করুন।"],
    [/withdraw.*(closed|time|hour)|outside.*(withdraw|payout).*hour/i, "উত্তোলনের নির্ধারিত সময়ের বাইরে আছেন। নির্ধারিত সময়ে আবার চেষ্টা করুন।"],
    [/weak password|password should be|password.*(at least|minimum)/i, "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের এবং নিরাপদ হতে হবে।"],
    [/otp.*(expired|invalid)|token.*(expired|invalid)|invalid.*otp/i, "OTP সঠিক নয় অথবা মেয়াদ শেষ হয়েছে। নতুন OTP নিয়ে আবার চেষ্টা করুন।"],
    [/rate limit|too many requests|over_email_send_rate_limit/i, "অল্প সময়ে অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।"],
    [/jwt expired|session.*(missing|not found|expired)|refresh token/i, "আপনার লগইন সেশনের মেয়াদ শেষ হয়েছে। আবার লগইন করুন।"],
    [/permission denied|row level security|not allowed|42501/i, "এই কাজটি করার অনুমতি আপনার নেই। প্রয়োজনে সহায়তা কেন্দ্রে যোগাযোগ করুন।"],
    [/network|failed to fetch|load failed|fetch failed|offline/i, "ইন্টারনেট সংযোগে সমস্যা হচ্ছে। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"],
    [/timeout|timed out/i, "সার্ভার থেকে উত্তর পেতে দেরি হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"],
    [/duplicate key|23505/i, "এই তথ্যটি আগে থেকেই রয়েছে। তথ্য যাচাই করে আবার চেষ্টা করুন।"],
    [/check constraint|23514|invalid input syntax|22p02/i, "আপনার দেওয়া তথ্যের কোনো অংশ সঠিক নয়। তথ্য যাচাই করে আবার চেষ্টা করুন।"],
    [/foreign key|23503/i, "সংশ্লিষ্ট তথ্য পাওয়া যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।"],
    [/502|503|504|500|server error|internal server/i, "সার্ভারে সাময়িক সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"]
  ];
  function toBengali(error, fallback) {
    const source = [error?.code, error?.message, error?.details, error?.hint]
      .filter(Boolean).join(" ");
    for (const [pattern, message] of rules) if (pattern.test(source)) return message;
    return fallback || "কাজটি সম্পন্ন করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।";
  }
  window.EarnStationErrors = Object.freeze({ toBengali });
})();