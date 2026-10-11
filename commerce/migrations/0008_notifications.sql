-- PR 3-7: notifications (M8). Additive only (D45).

-- Whether this person gets the team emails (I12, M9-20): 1 yes, 0 no, NULL = by role (owners yes, members no), so
-- nothing changes for anyone until they choose. At least one active person always gets them (worker/members.js).
ALTER TABLE admin_members ADD COLUMN team_alerts INTEGER;
