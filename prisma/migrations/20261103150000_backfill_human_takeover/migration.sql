-- Chats in which a person already replied before the takeover rule existed:
-- treat them as taken over, so the bot stays out.
UPDATE "Lead" l
SET "botEnabled" = false,
    "botDisabledReason" = 'HUMAN_TAKEOVER',
    "botDisabledAt" = m."lastManual",
    "botDisabledById" = m."sentById"
FROM (
  SELECT DISTINCT ON ("leadId") "leadId", "sentAt" AS "lastManual", "sentById"
  FROM "Message"
  WHERE "sentById" IS NOT NULL
  ORDER BY "leadId", "sentAt" DESC
) m
WHERE l.id = m."leadId" AND l."botEnabled" = true;
