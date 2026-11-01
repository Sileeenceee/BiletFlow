using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BiletFlow.Api.Data.EfMigrations
{
    /// <inheritdoc />
    public partial class AddSeatingAndTargetFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_AttendeeId_CreatedAt",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_EventId",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_EventId_CreatedAt",
                table: "AuditLogs");

            migrationBuilder.AddColumn<string>(
                name: "FullName",
                table: "Users",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "SeatId",
                table: "Tickets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SeatId",
                table: "OrderItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RefundPolicy",
                table: "Events",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SeatingMode",
                table: "Events",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "General");

            migrationBuilder.AddColumn<string>(
                name: "Timezone",
                table: "Events",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "Asia/Almaty");

            migrationBuilder.AddColumn<string>(
                name: "VenueAddress",
                table: "Events",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "VenueId",
                table: "Events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Venues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Venues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VenueSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VenueId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VenueSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VenueSections_Venues_VenueId",
                        column: x => x.VenueId,
                        principalTable: "Venues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Seats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RowLabel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsAccessible = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Seats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Seats_VenueSections_SectionId",
                        column: x => x.SectionId,
                        principalTable: "VenueSections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TicketTypeSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SectionId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketTypeSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TicketTypeSections_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TicketTypeSections_TicketTypes_TicketTypeId",
                        column: x => x.TicketTypeId,
                        principalTable: "TicketTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TicketTypeSections_VenueSections_SectionId",
                        column: x => x.SectionId,
                        principalTable: "VenueSections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SeatHolds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    SeatId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeatHolds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SeatHolds_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SeatHolds_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SeatHolds_Seats_SeatId",
                        column: x => x.SeatId,
                        principalTable: "Seats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_TicketTypes_SalesWindow",
                table: "TicketTypes",
                sql: "\"SalesEndAt\" > \"SalesStartAt\"");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_EventId_SeatId",
                table: "Tickets",
                columns: new[] { "EventId", "SeatId" },
                unique: true,
                filter: "\"SeatId\" IS NOT NULL AND \"Status\" NOT IN ('Cancelled', 'Refunded')");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_SeatId",
                table: "Tickets",
                column: "SeatId");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_AttendeeId_CreatedAt",
                table: "Orders",
                columns: new[] { "AttendeeId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_EventId_CreatedAt",
                table: "Orders",
                columns: new[] { "EventId", "CreatedAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Orders_Amounts",
                table: "Orders",
                sql: "\"Total\" >= 0 AND \"DiscountTotal\" >= 0 AND \"FeeTotal\" >= 0");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItems_OrderId_SeatId",
                table: "OrderItems",
                columns: new[] { "OrderId", "SeatId" },
                unique: true,
                filter: "\"SeatId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItems_SeatId",
                table: "OrderItems",
                column: "SeatId");

            migrationBuilder.CreateIndex(
                name: "IX_Events_VenueId",
                table: "Events",
                column: "VenueId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Events_Dates",
                table: "Events",
                sql: "\"EndDateUtc\" > \"StartDateUtc\"");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_EventId_ActionType",
                table: "AuditLogs",
                columns: new[] { "EventId", "ActionType" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_EventId_CreatedAt",
                table: "AuditLogs",
                columns: new[] { "EventId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_EventId_SeatId",
                table: "SeatHolds",
                columns: new[] { "EventId", "SeatId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_OrderId",
                table: "SeatHolds",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_SeatId",
                table: "SeatHolds",
                column: "SeatId");

            migrationBuilder.CreateIndex(
                name: "IX_Seats_SectionId_RowLabel_Number",
                table: "Seats",
                columns: new[] { "SectionId", "RowLabel", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketTypeSections_EventId_SectionId",
                table: "TicketTypeSections",
                columns: new[] { "EventId", "SectionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketTypeSections_SectionId",
                table: "TicketTypeSections",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketTypeSections_TicketTypeId",
                table: "TicketTypeSections",
                column: "TicketTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_VenueSections_VenueId",
                table: "VenueSections",
                column: "VenueId");

            migrationBuilder.AddForeignKey(
                name: "FK_Events_Venues_VenueId",
                table: "Events",
                column: "VenueId",
                principalTable: "Venues",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OrderItems_Seats_SeatId",
                table: "OrderItems",
                column: "SeatId",
                principalTable: "Seats",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_Seats_SeatId",
                table: "Tickets",
                column: "SeatId",
                principalTable: "Seats",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Events_Venues_VenueId",
                table: "Events");

            migrationBuilder.DropForeignKey(
                name: "FK_OrderItems_Seats_SeatId",
                table: "OrderItems");

            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_Seats_SeatId",
                table: "Tickets");

            migrationBuilder.DropTable(
                name: "SeatHolds");

            migrationBuilder.DropTable(
                name: "TicketTypeSections");

            migrationBuilder.DropTable(
                name: "Seats");

            migrationBuilder.DropTable(
                name: "VenueSections");

            migrationBuilder.DropTable(
                name: "Venues");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TicketTypes_SalesWindow",
                table: "TicketTypes");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_EventId_SeatId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_SeatId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Orders_AttendeeId_CreatedAt",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_EventId_CreatedAt",
                table: "Orders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Orders_Amounts",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_OrderItems_OrderId_SeatId",
                table: "OrderItems");

            migrationBuilder.DropIndex(
                name: "IX_OrderItems_SeatId",
                table: "OrderItems");

            migrationBuilder.DropIndex(
                name: "IX_Events_VenueId",
                table: "Events");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Events_Dates",
                table: "Events");

            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_EventId_ActionType",
                table: "AuditLogs");

            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_EventId_CreatedAt",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "FullName",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SeatId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SeatId",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "RefundPolicy",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "SeatingMode",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "Timezone",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "VenueAddress",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "VenueId",
                table: "Events");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_AttendeeId_CreatedAt",
                table: "Orders",
                columns: new[] { "AttendeeId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_EventId",
                table: "Orders",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_EventId_CreatedAt",
                table: "AuditLogs",
                columns: new[] { "EventId", "CreatedAt" });
        }
    }
}
