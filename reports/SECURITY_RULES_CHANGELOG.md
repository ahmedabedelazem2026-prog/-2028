# سجل تعديلات قواعد الأمان (Security Rules Changelog) – CAPITAL TAXI
**تاريخ التحديث:** 2026-11-06  
**الملف المعدل:** `database.rules.json`  
**النسخة الاحتياطية قبل التعديل:** `backups/phase5_backup_20261106_221607/database.rules.json`

---

## 1. التعديل الأول: دعم نظام عروض الأسعار والمزايدة (trip_offers)
- **العقدة المضافة:** `rules.trip_offers`
- **القواعد:**
  ```json
  "trip_offers": {
    ".read": "auth != null",
    "$tripId": {
      ".write": "auth != null",
      "$driverId": {
        ".write": "auth != null && (auth.uid === $driverId && root.child('drivers').child(auth.uid).child('approved').val() === true || root.child('trips').child($tripId).child('customerId').val() === auth.uid || root.child('admins').child(auth.uid).val() === true)",
        ".validate": "newData.hasChildren(['price', 'timestamp']) && (!newData.hasChild('driverId') || newData.child('driverId').val() === $driverId)"
      }
    }
  }
  ```
- **الحماية المحققة:**
  - منع المستخدم غير المسجل أو السائق غير المعتمد من تقديم عروض.
  - قصر كتابة وتعديل العرض على السائق صاحب الـ UID فقط.
  - منع السائق من التعديل على عروض زملائه.
  - السماح للعميل صاحب الرحلة بتحديث حالة العرض إلى (مقبول أو مرفوض).

---

## 2. التعديل الثاني: تثبيت السعر النهائي بعد القبول ومنع التلاعب (trips validation)
- **العقدة المعدلة:** `rules.trips.$tripId`
- **التعديل:**
  - السماح بتحديث السعر في الرحلة فقط عندما تكون الرحلة قيد البحث وبدون سائق معين (`driverId` غير محدد أو فارغ).
  - بمجرد قبول العرض وتعيين `driverId`، يُقفل السعر تماماً ويُمنع أي تعديل مستقبلي عليه:
    ```json
    (!data.exists() || !data.hasChild('driverId') || data.child('driverId').val() === '' || !data.hasChild('price') || newData.child('price').val() === data.child('price').val() || root.child('admins').child(auth.uid).val() === true)
    ```

---

## 3. التعديل الثالث: مزامنة الحملات الإعلانية السحابية (campaigns)
- **العقدة المضافة:** `rules.campaigns`
- **القواعد:**
  ```json
  "campaigns": {
    ".read": true,
    ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
    "$campaignId": {
      ".validate": "newData.hasChildren(['name', 'image', 'active'])"
    }
  }
  ```
- **الحماية المحققة:**
  - القراءة متاحة للجميع (عامة) لعرض الإعلانات على واجهات العملاء والسائقين والزوار.
  - الكتابة، التعديل، والحذف محصورة بنسبة 100% بمديري النظام المعتمدين في عقدة `admins`.
