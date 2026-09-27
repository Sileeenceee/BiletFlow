-- Add ticket inventory, simulated orders, payments, and issued tickets.
BEGIN;

ALTER TABLE "Events"
    ADD COLUMN IF NOT EXISTS "PaidSalesActivated" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "TicketTypes" (
    "Id" uuid NOT NULL,
    "EventId" uuid NOT NULL,
    "Name" character varying(120) NOT NULL,
    "Description" character varying(1000),
    "Price" numeric(12,2) NOT NULL,
    "Quantity" integer NOT NULL,
    "SoldQuantity" integer NOT NULL,
    "SalesStartAt" timestamp with time zone,
    "SalesEndAt" timestamp with time zone,
    "MaxPerOrder" integer NOT NULL,
    "IsHidden" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_TicketTypes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_TicketTypes_Events_EventId"
        FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Orders" (
    "Id" uuid NOT NULL,
    "AttendeeId" uuid NOT NULL,
    "EventId" uuid NOT NULL,
    "Status" character varying(32) NOT NULL,
    "Total" numeric(12,2) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_Orders" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Orders_Users_AttendeeId"
        FOREIGN KEY ("AttendeeId") REFERENCES "Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Orders_Events_EventId"
        FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "OrderItems" (
    "Id" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "TicketTypeId" uuid NOT NULL,
    "TicketTypeName" character varying(120) NOT NULL,
    "Quantity" integer NOT NULL,
    "UnitPrice" numeric(12,2) NOT NULL,
    CONSTRAINT "PK_OrderItems" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_OrderItems_Orders_OrderId"
        FOREIGN KEY ("OrderId") REFERENCES "Orders" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_OrderItems_TicketTypes_TicketTypeId"
        FOREIGN KEY ("TicketTypeId") REFERENCES "TicketTypes" ("Id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Tickets" (
    "Id" uuid NOT NULL,
    "OrderItemId" uuid NOT NULL,
    "Code" character varying(64) NOT NULL,
    "AttendeeName" character varying(200) NOT NULL,
    "AttendeeEmail" character varying(320) NOT NULL,
    "Status" character varying(32) NOT NULL,
    "IssuedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_Tickets" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Tickets_OrderItems_OrderItemId"
        FOREIGN KEY ("OrderItemId") REFERENCES "OrderItems" ("Id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Payments" (
    "Id" uuid NOT NULL,
    "OrderId" uuid NOT NULL,
    "Amount" numeric(12,2) NOT NULL,
    "Status" character varying(32) NOT NULL,
    "ProviderReference" character varying(100) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_Payments" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Payments_Orders_OrderId"
        FOREIGN KEY ("OrderId") REFERENCES "Orders" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_TicketTypes_EventId_IsHidden"
    ON "TicketTypes" ("EventId", "IsHidden");
CREATE INDEX IF NOT EXISTS "IX_Orders_AttendeeId_CreatedAt"
    ON "Orders" ("AttendeeId", "CreatedAt");
CREATE INDEX IF NOT EXISTS "IX_Orders_EventId" ON "Orders" ("EventId");
CREATE INDEX IF NOT EXISTS "IX_OrderItems_OrderId" ON "OrderItems" ("OrderId");
CREATE INDEX IF NOT EXISTS "IX_OrderItems_TicketTypeId" ON "OrderItems" ("TicketTypeId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Tickets_Code" ON "Tickets" ("Code");
CREATE INDEX IF NOT EXISTS "IX_Tickets_OrderItemId" ON "Tickets" ("OrderItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Payments_OrderId" ON "Payments" ("OrderId");

ALTER TABLE "Events" ALTER COLUMN "PaidSalesActivated" DROP DEFAULT;

COMMIT;
