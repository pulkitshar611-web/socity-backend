# Guard data scoping – checklist

Har guard ko **sirf apna data** dikhna chahiye; doosre guard ka data nahi.

## Database (zaroori)

- `visitor.checkedInById` column honi chahiye (guard jo check-in karta hai).
- `parcel.loggedByGuardId` column honi chahiye (guard jo parcel log karta hai).

Agar nahi hai to `prisma/run_guard_columns_manually.sql` chalao.

---

## Backend – kya filter hai

| API / Page | Guard ko kya dikhta hai |
|------------|-------------------------|
| **Visitor list** | Sirf apne check-in + pending/approved (checkedInById = me ya null + PENDING/APPROVED/PRE_APPROVED). |
| **Visitor stats** | Same scope (totalToday, activeNow, preApproved, totalMonth). |
| **Visitor check-in** | checkedInById = is guard set hota hai. |
| **Visitor updateStatus (approve/check-in)** | checkedInById = is guard set hota hai. |
| **Visitor checkOut** | Sirf wohi visitor jiska checkedInById = is guard. |
| **Parcel list** | Sirf jahan loggedByGuardId = is guard. |
| **Parcel getById** | Sirf apne logged parcels. |
| **Parcel create** | loggedByGuardId = is guard set hota hai. |
| **Parcel updateStatus** | Sirf apne logged parcels. |
| **Parcel stats** | Sirf apne parcels ka count. |
| **Incident list** | Sirf jahan reportedById = is guard. |
| **Incident stats** | Sirf apne reported incidents. |
| **Incident updateStatus** | Sirf apne reported incidents. |
| **Guard Dashboard stats** | visitorsToday, parcelsToDeliver, vehiclesIn = sirf is guard; pendingApprovals = society pending. |
| **Guard Dashboard activity** | Sirf is guard ke visitors, parcels, incidents (staff activity guard ke liye nahi). |
| **Staff list** | Guard ke liye empty (sirf apna data). |

---

## Auth

- `auth.middleware.js` mein `req.user.role` **DB se** set hota hai (fresh), taaki guard filter sahi kaam kare.

---

## Test

1. Guard 1 login → naya visitor check-in / parcel log / incident report karo.
2. Guard 2 login → list/stats/activity dekho.
3. Guard 2 ko Guard 1 ka data **nahi** dikhna chahiye.
