-- Rename the CONTACT stage label from «初步接触» to «已建立联系».
--
-- Why: «初步接触» collided with the lead stage. Leads are the pre-sales list
-- («未谈»), while CONTACT is the first stage of an opportunity that is already
-- tied to a customer («在谈»). Sharing the word made the two boards look like
-- duplicates, so the opportunity stage got a name that cannot be read as a lead.
--
-- The label is administrator-editable (opportunity_stage_configs.label), so new
-- installs get the new default from code while existing rows must be updated here.
-- Only the old default is rewritten; a label the admin deliberately customised is
-- left alone.
--
-- Safe to re-run: the UPDATE matches only rows still holding the old default.

UPDATE "opportunity_stage_configs"
SET "label" = '已建立联系'
WHERE "stage" = 'CONTACT'
  AND "label" = '初步接触';
