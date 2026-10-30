# Security Specification: Mess Tokens (Hostel Meal Tracker — Stage 1 + Meal Skips & Rollover)

## 1. Data Invariants
1. **Identity & Ownership (`StudentAccount` & `MealLog`)**:
   - Every `/students/{studentUid}` document MUST have `data.uid == studentUid == request.auth.uid`.
   - Every `/students/{studentUid}/mealLogs/{logId}` document MUST belong to an existing `/students/{studentUid}` parent document where `studentUid == request.auth.uid` and `data.studentUid == request.auth.uid`.
   - Standard writes require `request.auth != null && request.auth.token.email_verified == true`.
2. **Token Mathematics, Rollover Cap & Non-Negative Overdraft Invariant**:
   - Base monthly credit is `60`. Unused tokens from the prior month roll over capped at `10`: `0 <= rolloverTokens <= 10`.
   - `monthlyAllowance == 60 + rolloverTokens` (hence `60 <= monthlyAllowance <= 70`).
   - `tokenBalance` MUST be an integer satisfying `0 <= tokenBalance <= 130`.
   - Conservation of tokens: `tokenBalance == monthlyAllowance - tokensUsed + tokensRefunded`.
   - Overdraft block: `tokenBalance` can NEVER drop below `0`, and `balanceAfter` on any `MealLog` can NEVER be negative (`balanceAfter >= 0`).
3. **Deterministic Meal Pricing & Skip Refund Rules**:
   - `mealType == 'breakfast'` requires `baseCost == 1`.
   - `mealType == 'lunch'` requires `baseCost == 2`.
   - `mealType == 'dinner'` requires `baseCost == 2`.
   - When `entryKind == 'meal'`:
     - `refundTokens == 0`
     - `tokenCost == (isGuestMeal ? baseCost * 2 : baseCost)`
     - `balanceAfter == balanceBefore - tokenCost` and `balanceAfter >= 0`
   - When `entryKind == 'skip'`:
     - Must be logged before 8:00 PM (`20:00`) on the calendar day prior to `targetMealDate`.
     - `isGuestMeal == false` and `tokenCost == 0`.
     - Refund is half the meal's base tokens, rounded down (`floor(baseCost / 2)`):
       - Breakfast (`baseCost == 1`) -> `refundTokens == 0`
       - Lunch (`baseCost == 2`) -> `refundTokens == 1`
       - Dinner (`baseCost == 2`) -> `refundTokens == 1`
     - `balanceAfter == balanceBefore + refundTokens`.
4. **Immutability & Temporal Integrity**:
   - `MealLog` entries are append-only ledger records (`allow update, delete: if false`).
   - `createdAt` must equal `request.time` on creation and remain immutable on `StudentAccount` updates; `updatedAt` must equal `request.time`.

## 2. The "Dirty Dozen" Payloads
1. **Payload 1 (Identity Spoofing on Student Account)**: Authenticated user `uid_attacker` creates `/students/uid_victim`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Write)**: User with `email_verified: false` attempts to create `/students/uid_1`. -> `PERMISSION_DENIED`
3. **Payload 3 (Overdraft Balance Below Zero)**: User updates `/students/uid_1` with `tokenBalance: -2`. -> `PERMISSION_DENIED`
4. **Payload 4 (Rollover Exceeding 10-Token Cap)**: User updates `/students/uid_1` with `rolloverTokens: 15, monthlyAllowance: 75`. -> `PERMISSION_DENIED`
5. **Payload 5 (Broken Token Conservation Math)**: User updates `/students/uid_1` where `tokenBalance != monthlyAllowance - tokensUsed + tokensRefunded`. -> `PERMISSION_DENIED`
6. **Payload 6 (Tampered Meal Pricing)**: User logs a `"dinner"` meal with `baseCost: 1, tokenCost: 1` instead of `baseCost: 2`. -> `PERMISSION_DENIED`
7. **Payload 7 (Bypassed Guest Multiplier)**: User logs a guest lunch (`mealType: "lunch", isGuestMeal: true`) with `tokenCost: 2` instead of `4`. -> `PERMISSION_DENIED`
8. **Payload 8 (Negative MealLog BalanceAfter)**: User logs a dinner costing 4 tokens when `balanceBefore: 2`, setting `balanceAfter: -2`. -> `PERMISSION_DENIED`
9. **Payload 9 (Inflated Skip Refund)**: User logs a skip for `breakfast` (`baseCost: 1`) claiming `refundTokens: 1` instead of `floor(1/2) = 0`, or `lunch` (`baseCost: 2`) claiming `refundTokens: 2` instead of `1`. -> `PERMISSION_DENIED`
10. **Payload 10 (Shadow / Ghost Field Injection)**: User sends `isAdmin: true` in `/students/uid_1`. -> `PERMISSION_DENIED`
11. **Payload 11 (Resource Poisoning / Oversized Strings)**: User injects a 2,000-character string into `notes`. -> `PERMISSION_DENIED`
12. **Payload 12 (Retroactive Ledger Tampering)**: User attempts to `update` or `delete` an existing `/students/uid_1/mealLogs/log_1` document. -> `PERMISSION_DENIED`
