-- Migrate the legacy EnsureCreated schema to the current EF model.
BEGIN;

ALTER TABLE "Events"
    ADD COLUMN IF NOT EXISTS "Slug" character varying(200),
    ADD COLUMN IF NOT EXISTS "Venue" character varying(250) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "City" character varying(120) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "StartDateUtc" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "EndDateUtc" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "IsPublished" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamp with time zone;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Events'
          AND column_name = 'VenueName'
    ) THEN
        UPDATE "Events"
        SET "Slug" = left(
                trim(both '-' from regexp_replace(lower("Title"), '[^[:alnum:]]+', '-', 'g')),
                180
            ) || '-' || left(replace("Id"::text, '-', ''), 8),
            "Venue" = "VenueName",
            "StartDateUtc" = "StartsAt",
            "EndDateUtc" = "EndsAt",
            "IsPublished" = lower("Visibility") = 'public';
    END IF;
END $$;

ALTER TABLE "Events"
    ALTER COLUMN "Title" TYPE character varying(200),
    ALTER COLUMN "Description" TYPE character varying(4000),
    ALTER COLUMN "Slug" SET NOT NULL,
    ALTER COLUMN "Venue" SET NOT NULL,
    ALTER COLUMN "Venue" DROP DEFAULT,
    ALTER COLUMN "City" SET NOT NULL,
    ALTER COLUMN "City" DROP DEFAULT,
    ALTER COLUMN "StartDateUtc" SET NOT NULL,
    ALTER COLUMN "EndDateUtc" SET NOT NULL,
    ALTER COLUMN "IsPublished" SET NOT NULL,
    ALTER COLUMN "IsPublished" DROP DEFAULT,
    ALTER COLUMN "CreatedAt" SET NOT NULL,
    ALTER COLUMN "CreatedAt" DROP DEFAULT;

DROP INDEX IF EXISTS "IX_Events_Visibility_StartsAt";

ALTER TABLE "Events"
    DROP COLUMN IF EXISTS "Category",
    DROP COLUMN IF EXISTS "VenueName",
    DROP COLUMN IF EXISTS "VenueAddress",
    DROP COLUMN IF EXISTS "StartsAt",
    DROP COLUMN IF EXISTS "EndsAt",
    DROP COLUMN IF EXISTS "RegistrationOpensAt",
    DROP COLUMN IF EXISTS "RegistrationClosesAt",
    DROP COLUMN IF EXISTS "Visibility",
    DROP COLUMN IF EXISTS "Capacity",
    DROP COLUMN IF EXISTS "TicketsSold";

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Events_Slug" ON "Events" ("Slug");

CREATE TABLE IF NOT EXISTS "OrganizerProfiles" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "BusinessName" character varying(200) NOT NULL,
    "DisplayName" character varying(120) NOT NULL,
    "ContactEmail" character varying(320),
    "PhoneNumber" character varying(30),
    "Bio" character varying(2000),
    "Website" character varying(500),
    "IsVerified" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone,
    CONSTRAINT "PK_OrganizerProfiles" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrganizerProfiles_Users_UserId"
        FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_OrganizerProfiles_UserId"
    ON "OrganizerProfiles" ("UserId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" ("Email");
CREATE INDEX IF NOT EXISTS "IX_AuthTokens_UserId_Type_TokenHash"
    ON "AuthTokens" ("UserId", "Type", "TokenHash");

COMMIT;