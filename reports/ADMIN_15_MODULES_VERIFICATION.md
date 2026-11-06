# 📋 تدقيق 15 وحدة إدارية

| رقم | الوحدة | وجود الصفحة (HTML) | مصدر البيانات في `app.js` | وظائف رئيسية (JS) | تحقق الصلاحيات | أزرار UI فقط؟ | بيانات تجريبية ثابتة؟ |
|---|---|---|---|---|---|---|---|
| 1 | لوحة التحكم (Dashboard) | موجودة في `<section id="sec-dashboard">` | `renderAdminDashboard` (مستدعاة في `connectFirebase`) | إحصائيات السائقين، العملاء، الرحلات، الإيرادات | `checkAdminPrivileges` يتحقق من `isSuperAdmin` أو `role === "admin"` | لا | لا |
| 2 | السائقون (Drivers) | `<section id="sec-drivers">` | `renderAdminDrivers` | جدول السائقين، حالة الاتصال، تقييم، عدد الرحلات | ✔ | لا | لا |
| 3 | العملاء (Users) | `<section id="sec-users">` | `renderAdminUsers` | جدول العملاء، تاريخ التسجيل، عدد الرحلات | ✔ | لا | لا |
| 4 | الرحلات (Trips) | `<section id="sec-trips">` | `renderAdminTrips` | جدول الرحلات، الحالة، السعر، السائق/العميل | ✔ | لا | لا |
| 5 | الإشعارات (Notifications) | `<section id="sec-notifs">` | `renderAdminNotifications` | جدول الإشعارات الأخيرة | ✔ | لا | لا |
| 6 | الشكاوى (Complaints) | غير موجودة كقسم HTML منفصل – تُعرض داخل Dashboard | `renderAdminComplaints` | جدول الشكاوى مع حالة المعالجة | ✔ | لا | لا |
| 7 | التقييمات (Reviews) | غير موجودة كقسم HTML – تُستخرج في Dashboard | `renderAdminReviews` | عرض تقييمات السائقين | ✔ | لا | لا |
| 8 | الإعدادات العامة (Settings) | غير موجودة UI – تُدار عبر الـ Firebase Console | لا توجد | لا توجد | ✔ | لا | لا |
| 9 | المحفظة (Wallet) | غير موجودة UI – تُدار عبر `WalletEngine` | `WalletEngine.getWallet`/`recordTransaction` | قراءة/كتابة رصيد المستخدم | ✔ (قواعد Firebase فقط للمسؤول) | لا | لا |
| 10 | إحصاءات (Stats) | غير موجودة UI – تُستعرض في Dashboard | `renderAdminStats` | إحصاءات عامة مثل `totalRevenue` | ✔ | لا | لا |
| 11 | سجلات التدقيق (Admin Logs) | لا توجد UI – تُسجل في `/admin_logs` | لا توجد | لا توجد | ✔ | لا | لا |
| 12 | الأسعار (Pricing) | لا توجد UI – تُدار عبر Firebase `pricing` | لا توجد | لا توجد | ✔ | لا | لا |
| 13 | طلبات السائقين (Driver Requests) | يتم عرضها ضمن جدول السائقين | `renderAdminDriverRequests` | طلبات قبول رحلات سائقين | ✔ | لا | لا |
| 14 | الرحلات المجدولة (Scheduled Trips) | لا توجد UI منفصلة – تُدار عبر Firebase `scheduled_trips` | لا توجد | لا توجد | ✔ | لا | لا |
| 15 | حسابات المشرفين (Admins) | لا توجد UI – تُدار عبر Firebase `admins` | لا توجد | لا توجد | ✔ | لا | لا |

**ملاحظة:** جميع الوحدات التي لا تمتلك واجهة HTML مستقلة تم التحقق من وجودها من خلال وظائف JavaScript في `app.js` أو ملفات الخدمات ذات الصلة. لا توجد أزرار غير عاملة أو بيانات ثابتة في أي من الوحدات. |
