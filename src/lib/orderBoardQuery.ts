// createdAt is stored as a UTC timestamp without time zone. Compare the raw
// column to today's Kaliningrad boundaries so PostgreSQL can use its index.
export const boardTodaySql = `
  "createdAt" >= ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad')
    AT TIME ZONE 'Europe/Kaliningrad') AT TIME ZONE 'UTC')
  AND "createdAt" < (((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad') + INTERVAL '1 day')
    AT TIME ZONE 'Europe/Kaliningrad') AT TIME ZONE 'UTC')`;

// Apply to both reads and mutations: an unpaid/refunded/cancelled payment must
// not be prepared or issued through an old card on another screen.
export const boardPaymentSql = `"paymentStatus" = 'SUCCEEDED'`;


// New cash/card/SBP orders are visible while awaiting payment. Preparation
// still requires payment; only cash can be confirmed explicitly by staff.
export const boardQueuePaymentSql = `(${boardPaymentSql} OR
  ("paymentMethod" IN ('CASH', 'CARD', 'SBP') AND "paymentStatus" = 'PENDING' AND status IN ('PENDING', 'CONFIRMED')))`;
