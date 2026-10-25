# Fictional leaking-tap demo

Use a customer and two independently authenticated workers, all onboarded in the same city. Keep credentials private. The test fixtures in `scripts/test-database.mjs` are examples, not production credentials.

1. Customer: create “Kitchen tap keeps dripping”, describe the leak, provide a private address, optionally upload a photo/voice note. Answer guided questions, build/edit the brief, and explicitly confirm it.
2. Customer: invite both plumbers from the overview. The exact address remains hidden from them until assignment.
3. Worker A: submit ₹100 visit + ₹250 labour + ₹100 material allowance = ₹450. Worker B: submit ₹150 visit + ₹200 labour + ₹150 material allowance = ₹500. Each worker sees only their own terms and messages.
4. Customer: open Quotes, counter A's labour to ₹200. The original stays in history and the new maximum is ₹400. A must sign in and accept the exact counteroffer.
5. A: start the job, propose a full replacement agreement adding ₹100 connector labour and ₹150 connector materials. Customer sees ₹400 → ₹650 and must approve or reject explicitly. Rejection leaves ₹400 authorised. If rejected, A can revise and propose again.
6. A: enter actual item costs within every approved cap and request completion. Customer reviews and confirms. Open receipt; print or Save as PDF. It records agreement/approval history and says no payment was collected through FixFirst.
7. Reload and verify the receipt is stable. Try another customer's account and verify no access. Confirm the losing worker cannot access the assigned worker's exact address, agreement or receipt.

Suggested two-minute demonstration: 15 seconds problem, 20 seconds brief, 25 seconds quotes/counter, 30 seconds explicit change approval, 20 seconds completion/receipt, 10 seconds explaining why unapproved charges never enter the agreement.

This script requires a configured live/local Supabase project. Database integration tests and public browser tests are useful verification but are not a recorded live multi-user demo.
