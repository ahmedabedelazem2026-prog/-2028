# تاكسي العاصمة

موقع أولي للعميل والسائق والإدارة، يستخدم Firebase Authentication وRealtime Database في مشروع taxi-alasema-app-2026.

## بنية البيانات المستخدمة
- `trips/{tripId}`: الرحلات. الحقول المستخدمة: `clientId`, `clientPhone`, `from`, `fromName`, `to`, `toName`, `carType`, `status`, `createdAt`, وعند القبول `driverId`, `driverName`, `acceptedAt`.
- `drivers/{uid}`: ملف السائق، ويحتوي `name`, `phone`, `email`, `role`, `approved`, `available`.
- `customers/{uid}`: ملف العميل.
- `admins/{uid}`: سجل تفعيل لوحة الإدارة، ويحتاج إنشاءه من وحدة تحكم Firebase بعد التأكد من UID حساب الإدارة.

## تنبيهات مهمة قبل التشغيل
1. تم توصيل إعدادات Firebase Web بالمشروع القديم.
2. الموقع يكتب حقول أسماء الانطلاق والوجهة فقط؛ لا يخترع إحداثيات أو سعرًا. يلزم ربط خرائط Google وحساب السعر قبل اعتبار بيانات الرحلات متوافقة تمامًا مع تطبيق Android القديم.
3. قبول الرحلة يستخدم Realtime Database transaction على سجل الرحلة لمنع قبولها مرتين.
4. لم يتم نشر Realtime Database Rules؛ لا بد من مراجعة القواعد الحالية قبل تعديلها كي لا تتأثر تطبيقات Android القديمة.
5. حساب السائق الجديد يبقى `approved:false` حتى تعتمده الإدارة.
6. لوحة الإدارة تتطلب سجل `admins/{uid}` بقيمة `active:true` لحساب إداري موثوق.
7. تسجيل الدخول الحالي بالبريد وكلمة المرور. تسجيل الدخول برقم الهاتف عبر SMS يحتاج تهيئة Phone Auth وreCAPTCHA بشكل منفصل.
8. لا تضع Service Account أو مفاتيح خاصة في ملفات الموقع.
